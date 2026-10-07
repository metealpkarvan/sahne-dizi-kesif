import { ApiError } from './validation.js';

export async function ensureShow(client, id, show) {
  if (show) {
    if (show.id !== id) throw new ApiError(400,'SHOW_MISMATCH','Dizi kimliği eşleşmiyor.');
    // Snapshots are bounded display data. Existing shared metadata is never overwritten by another user's payload.
    await client.query('INSERT INTO sahne_shows(show_id,snapshot) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[id,JSON.stringify(show)]);
  }
  const result = await client.query('SELECT snapshot FROM sahne_shows WHERE show_id=$1',[id]);
  if (!result.rows.length) throw new ApiError(400,'SHOW_REQUIRED','Bu dizi için başlık ve afiş bilgisi gerekli.');
  return result.rows[0].snapshot;
}
export async function lockLibrary(client,userId) {
  await client.query('INSERT INTO sahne_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
  const {rows} = await client.query('SELECT library_version FROM sahne_profiles WHERE user_id=$1 FOR UPDATE',[userId]);
  return rows[0].library_version;
}
export async function bumpLibrary(client,userId) {
  const {rows} = await client.query('UPDATE sahne_profiles SET library_version=library_version+1,updated_at=now() WHERE user_id=$1 RETURNING library_version',[userId]);
  return rows[0].library_version;
}
export async function getLibrary(client,userId) {
  // One statement gives a consistent snapshot even if a different device saves concurrently.
  const {rows} = await client.query(`SELECT
    COALESCE((SELECT library_version FROM sahne_profiles WHERE user_id=$1),0) AS version,
    COALESCE((SELECT jsonb_object_agg(show_id::text,entry) FROM sahne_library WHERE user_id=$1),'{}'::jsonb) AS entries,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',list_id,'name',name,'description',description) ORDER BY position) FROM sahne_lists WHERE user_id=$1),'[]'::jsonb) AS lists,
    COALESCE((SELECT jsonb_object_agg(show_id::text,reaction) FROM sahne_reactions WHERE user_id=$1),'{}'::jsonb) AS ratings,
    COALESCE((SELECT jsonb_agg(s.snapshot ORDER BY s.show_id) FROM sahne_shows s WHERE s.show_id IN
      (SELECT show_id FROM sahne_library WHERE user_id=$1 UNION SELECT show_id FROM sahne_reactions WHERE user_id=$1 UNION SELECT show_id FROM sahne_ratings WHERE user_id=$1)),'[]'::jsonb) AS shows`,[userId]);
  return rows[0];
}
export async function syncLibrary(client,userId,data) {
  const version = await lockLibrary(client,userId);
  if (version !== data.version) throw new ApiError(409,'VERSION_CONFLICT','Arşivin başka bir oturumda değişti. Güncel arşivi yükleyip yeniden dene.',{version});
  const listIds = new Set(data.lists.map(list => list.id));
  if (listIds.size !== data.lists.length) throw new ApiError(400,'INVALID_INPUT','Seçki kimlikleri farklı olmalı.');
  const shows = new Map(data.shows.map(show => [show.id,show]));
  if (shows.size !== data.shows.length) throw new ApiError(400,'INVALID_INPUT','Dizi kayıtları tekrar etmemeli.');
  const needed = [...new Set([...Object.keys(data.entries),...Object.keys(data.ratings)].map(Number))];
  // All incoming rows are validated before replacing the current account's snapshot.
  for (const id of needed) {
    const entry = data.entries[id];
    if (entry?.lists?.some(list => !listIds.has(list))) throw new ApiError(400,'INVALID_INPUT','Dizi bilinmeyen bir seçkiye bağlı.');
  }
  const snapshots = needed.filter(id => shows.has(id)).map(id => ({id,snapshot:shows.get(id)}));
  if (snapshots.length) await client.query(`INSERT INTO sahne_shows(show_id,snapshot)
    SELECT id,snapshot FROM jsonb_to_recordset($1::jsonb) AS x(id integer,snapshot jsonb) ON CONFLICT DO NOTHING`,[JSON.stringify(snapshots)]);
  const existing = await client.query('SELECT show_id FROM sahne_shows WHERE show_id=ANY($1::integer[])',[needed]);
  if (existing.rows.length !== needed.length) throw new ApiError(400,'SHOW_REQUIRED','Arşivdeki yeni dizilerin başlık bilgisi gerekli.');
  for (const table of ['sahne_library','sahne_lists','sahne_ratings','sahne_reactions']) await client.query(`DELETE FROM ${table} WHERE user_id=$1`,[userId]);
  const entries = Object.entries(data.entries).map(([id,entry]) => ({id:Number(id),entry}));
  if (entries.length) await client.query(`INSERT INTO sahne_library(user_id,show_id,entry)
    SELECT $1,id,entry FROM jsonb_to_recordset($2::jsonb) AS x(id integer,entry jsonb)`,[userId,JSON.stringify(entries)]);
  const scores = entries.filter(row => row.entry.rating !== undefined).map(row => ({id:row.id,units:row.entry.rating*2}));
  if (scores.length) await client.query(`INSERT INTO sahne_ratings(user_id,show_id,score_units)
    SELECT $1,id,units FROM jsonb_to_recordset($2::jsonb) AS x(id integer,units smallint)`,[userId,JSON.stringify(scores)]);
  if (data.lists.length) await client.query(`INSERT INTO sahne_lists(user_id,list_id,name,description,position)
    SELECT $1,id,name,description,position FROM jsonb_to_recordset($2::jsonb) AS x(id text,name text,description text,position integer)`,[userId,JSON.stringify(data.lists.map((list,position)=>({...list,position})))]);
  const reactions = Object.entries(data.ratings).map(([id,reaction])=>({id:Number(id),reaction}));
  if (reactions.length) await client.query(`INSERT INTO sahne_reactions(user_id,show_id,reaction)
    SELECT $1,id,reaction FROM jsonb_to_recordset($2::jsonb) AS x(id integer,reaction text)`,[userId,JSON.stringify(reactions)]);
  await bumpLibrary(client,userId);
  return getLibrary(client,userId);
}
export async function setRating(client,userId,showId,rating) {
  if (rating === null) {
    await client.query('DELETE FROM sahne_ratings WHERE user_id=$1 AND show_id=$2',[userId,showId]);
    await client.query(`UPDATE sahne_library SET entry=entry-'rating',updated_at=now() WHERE user_id=$1 AND show_id=$2`,[userId,showId]);
    await client.query(`DELETE FROM sahne_library WHERE user_id=$1 AND show_id=$2 AND entry='{}'::jsonb`,[userId,showId]);
  } else {
    await client.query(`INSERT INTO sahne_ratings(user_id,show_id,score_units) VALUES($1,$2,$3)
      ON CONFLICT(user_id,show_id) DO UPDATE SET score_units=EXCLUDED.score_units,updated_at=now()`,[userId,showId,rating*2]);
    await client.query(`INSERT INTO sahne_library(user_id,show_id,entry) VALUES($1,$2,jsonb_build_object('rating',$3::numeric))
      ON CONFLICT(user_id,show_id) DO UPDATE SET entry=sahne_library.entry||EXCLUDED.entry,updated_at=now()`,[userId,showId,rating]);
  }
}
export async function ratingSummary(client,showId,userId) {
  const {rows} = await client.query(`SELECT COALESCE(round(avg(score_units::numeric)/2,2),0)::float8 AS average,count(*)::integer AS count,
    (SELECT score_units::float8/2 FROM sahne_ratings WHERE show_id=$1 AND user_id=$2) AS "yourRating"
    FROM sahne_ratings WHERE show_id=$1`,[showId,userId]);
  return rows[0];
}
