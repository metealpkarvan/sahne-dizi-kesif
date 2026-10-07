import { randomUUID, createHash } from 'node:crypto';
import { auth, trustedOrigins } from './auth.js';
import { query, transaction } from './db.js';
import { ApiError, avatarSchema, parseMutation, pageOptions, numericShowId } from './validation.js';
import { ensureShow, lockLibrary, bumpLibrary, getLibrary, syncLibrary, setRating, ratingSummary } from './library.js';

const database = {query};
const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const publicAvatar = row => {
  if(!avatarSchema.safeParse(row.image).success)return null;
  if(!row.image?.startsWith('data:'))return row.image;
  const version=createHash('sha256').update(row.image).digest('hex').slice(0,16);
  return `/api/community?action=avatar&id=${encodeURIComponent(row.user_id||row.id)}&v=${version}`;
};
const publicUser = row => ({
  id:row.user_id || row.id,
  username:row.username || null,
  name:String(row.name || '').slice(0,100),
  image:publicAvatar(row),
  bio:row.bio || '',
  createdAt:row.user_created_at || row.createdAt,
});
const userColumns = `u.id AS user_id,u.username,u.name,u.image,u."createdAt" AS user_created_at,COALESCE(pr.bio,'') AS bio`;
const postSelect = `SELECT p.*,${userColumns},s.snapshot AS show,
  (SELECT count(*)::integer FROM sahne_likes WHERE post_id=p.id) AS like_count,
  (SELECT count(*)::integer FROM sahne_posts r WHERE r.topic_id=p.id AND r.deleted_at IS NULL) AS reply_count,
  EXISTS(SELECT 1 FROM sahne_likes WHERE post_id=p.id AND user_id=$1) AS liked_by_me
  FROM sahne_posts p JOIN "user" u ON u.id=p.user_id
  LEFT JOIN sahne_profiles pr ON pr.user_id=u.id LEFT JOIN sahne_shows s ON s.show_id=p.show_id`;
const postVisible = `p.deleted_at IS NULL AND (p.topic_id IS NULL OR EXISTS(SELECT 1 FROM sahne_posts parent WHERE parent.id=p.topic_id AND parent.deleted_at IS NULL))`;
function postDto(row,viewerId) {
  return {id:row.id,kind:row.kind,user:publicUser(row),show:row.show || null,title:row.title || null,category:row.category,
    body:row.body,spoiler:row.spoiler,watchedAt:row.watched_at ?? null,
    rating:row.score_units === null ? null : row.score_units/2,createdAt:row.created_at,updatedAt:row.updated_at,
    likeCount:row.like_count,replyCount:row.reply_count,likedByMe:row.liked_by_me,isOwn:row.user_id===viewerId,topicId:row.topic_id || null};
}
async function getPost(client,id,viewerId) {
  const {rows} = await client.query(`${postSelect} WHERE p.id=$2 AND ${postVisible}`,[viewerId,id]);
  if (!rows.length) throw new ApiError(404,'NOT_FOUND','Bu paylaşım bulunamadı.');
  return postDto(rows[0],viewerId);
}
async function listPosts(client,viewerId,params,filters=[]) {
  const {limit,cursor} = pageOptions(params);
  const values = [viewerId];
  const conditions = [postVisible];
  const add = (sql,value) => {values.push(value);conditions.push(sql.replace('?',`$${values.length}`));};
  for (const [sql,value] of filters) add(sql,value);
  if (cursor) {values.push(cursor.at,cursor.id);conditions.push(`(p.created_at,p.id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`);}
  values.push(limit+1);
  const {rows} = await client.query(`${postSelect} WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC,p.id DESC LIMIT $${values.length}`,values);
  const visible = rows.slice(0,limit),last=visible.at(-1);
  return {items:visible.map(row=>postDto(row,viewerId)),nextCursor:rows.length>limit ? Buffer.from(JSON.stringify({at:last.created_at,id:last.id})).toString('base64url') : null};
}
async function getUser(client,usernameValue) {
  const {rows} = await client.query(`SELECT ${userColumns} FROM "user" u LEFT JOIN sahne_profiles pr ON pr.user_id=u.id WHERE lower(u.username)=lower($1)`,[usernameValue]);
  if (!rows.length) throw new ApiError(404,'NOT_FOUND','Bu kullanıcı bulunamadı.');
  return publicUser(rows[0]);
}
async function profile(client,usernameValue,viewerId) {
  const user = await getUser(client,usernameValue);
  const {rows:[stats]} = await client.query(`SELECT
    (SELECT count(*)::integer FROM sahne_follows WHERE following_id=$1) AS "followerCount",
    (SELECT count(*)::integer FROM sahne_follows WHERE follower_id=$1) AS "followingCount",
    (SELECT count(*)::integer FROM sahne_library WHERE user_id=$1 AND entry->>'status'='done') AS "watchedCount",
    (SELECT count(*)::integer FROM sahne_posts WHERE user_id=$1 AND kind='log' AND deleted_at IS NULL) AS "logCount",
    EXISTS(SELECT 1 FROM sahne_follows WHERE follower_id=$2 AND following_id=$1) AS following`,[user.id,viewerId]);
  const {items:logs} = await listPosts(client,viewerId,new URLSearchParams({limit:'50'}),[['p.user_id=?',user.id],["p.kind=?",'log']]);
  const {rows:watchedRows} = await client.query(`SELECT l.show_id,l.entry,s.snapshot AS show FROM sahne_library l
    JOIN sahne_shows s ON s.show_id=l.show_id WHERE user_id=$1 AND entry->>'status'='done' ORDER BY l.updated_at DESC LIMIT 200`,[user.id]);
  // Journal notes stay private unless their author explicitly creates a public log.
  const watched = watchedRows.map(row=>({showId:row.show_id,show:row.show,status:'done',rating:row.entry.rating??null,date:row.entry.date??null,favorite:!!row.entry.favorite}));
  const {rows:lists} = await client.query(`SELECT list_id AS id,name,description,
    (SELECT count(*)::integer FROM sahne_library l WHERE l.user_id=$1 AND l.entry->'lists' ? cl.list_id) AS "showCount",
    COALESCE((SELECT jsonb_agg(preview.snapshot ORDER BY preview.show_id) FROM
      (SELECT s.snapshot,l.show_id FROM sahne_library l JOIN sahne_shows s ON s.show_id=l.show_id
        WHERE l.user_id=$1 AND l.entry->'lists' ? cl.list_id ORDER BY l.show_id LIMIT 12) preview),'[]'::jsonb) AS shows
    FROM sahne_lists cl WHERE cl.user_id=$1 ORDER BY position`,[user.id]);
  const {following,...counts}=stats;
  return {user,stats:counts,logs,watched,lists,following};
}
async function notifications(client,userId,params) {
  const {limit,cursor}=pageOptions(params),values=[userId],conditions=['n.recipient_id=$1',"(n.post_id IS NULL OR EXISTS(SELECT 1 FROM sahne_posts p WHERE p.id=n.post_id AND p.deleted_at IS NULL))"];
  if(cursor){values.push(cursor.at,cursor.id);conditions.push('(n.created_at,n.id)<($2::timestamptz,$3::uuid)');}
  values.push(limit+1);
  const {rows}=await client.query(`SELECT n.*,${userColumns},p.title,s.snapshot AS show FROM sahne_notifications n
    JOIN "user" u ON u.id=n.actor_id LEFT JOIN sahne_profiles pr ON pr.user_id=u.id LEFT JOIN sahne_posts p ON p.id=n.post_id
    LEFT JOIN sahne_shows s ON s.show_id=p.show_id WHERE ${conditions.join(' AND ')} ORDER BY n.created_at DESC,n.id DESC LIMIT $${values.length}`,values);
  const {rows:[count]}=await client.query(`SELECT count(*)::integer AS unread FROM sahne_notifications n WHERE recipient_id=$1 AND read_at IS NULL
    AND (post_id IS NULL OR EXISTS(SELECT 1 FROM sahne_posts p WHERE p.id=n.post_id AND p.deleted_at IS NULL))`,[userId]);
  const visible=rows.slice(0,limit),last=visible.at(-1);
  return {items:visible.map(row=>({id:row.id,kind:row.kind,user:publicUser(row),actor:publicUser(row),postId:row.post_id,topicId:row.kind==='reply'?row.post_id:null,title:row.title,message:({follow:'Seni takip etmeye başladı.',like:'Paylaşımını beğendi.',reply:'Tartışmana yanıt verdi.'})[row.kind],show:row.show||null,createdAt:row.created_at,read:!!row.read_at,readAt:row.read_at})),unreadCount:count.unread,
    nextCursor:rows.length>limit?Buffer.from(JSON.stringify({at:last.created_at,id:last.id})).toString('base64url'):null};
}
async function notify(client,recipient,actor,kind,postId=null) {
  if(recipient===actor)return;
  await client.query('INSERT INTO sahne_notifications(id,recipient_id,actor_id,kind,post_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),recipient,actor,kind,postId]);
}
async function checkWriteLimit(client,userId) {
  const {rows}=await client.query(`INSERT INTO sahne_write_limits(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET
    count=CASE WHEN sahne_write_limits.window_start < now()-interval '1 minute' THEN 1 ELSE sahne_write_limits.count+1 END,
    window_start=CASE WHEN sahne_write_limits.window_start < now()-interval '1 minute' THEN now() ELSE sahne_write_limits.window_start END RETURNING count`,[userId]);
  if(rows[0].count>120)throw new ApiError(429,'RATE_LIMITED','Çok hızlı işlem yapıyorsun. Bir dakika sonra yeniden dene.');
}
async function insertPost(client,userId,kind,data) {
  let showId=data.showId??null;
  if(kind==='reply') {
    const {rows}=await client.query(`SELECT user_id,show_id FROM sahne_posts WHERE id=$1 AND kind='topic' AND deleted_at IS NULL FOR SHARE`,[data.topicId]);
    if(!rows.length)throw new ApiError(404,'NOT_FOUND','Bu tartışma bulunamadı.');
    showId=rows[0].show_id;
    await notify(client,rows[0].user_id,userId,'reply',data.topicId);
  } else if(showId!==null)await ensureShow(client,showId,data.show);
  const id=randomUUID();
  await client.query(`INSERT INTO sahne_posts(id,user_id,kind,show_id,topic_id,title,category,body,spoiler,watched_at,score_units)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,userId,kind,showId,data.topicId??null,data.title??null,data.category||'general',data.body||'',data.spoiler,data.watchedAt??null,data.rating!==undefined?data.rating*2:null]);
  return getPost(client,id,userId);
}
async function mutate(client,userId,action,data) {
  switch(action) {
    case 'updateProfile': {
      await client.query('INSERT INTO sahne_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
      if(data.bio!==undefined)await client.query('UPDATE sahne_profiles SET bio=$2,updated_at=now() WHERE user_id=$1',[userId,data.bio]);
      if(data.name!==undefined)await client.query('UPDATE "user" SET name=$2,"updatedAt"=now() WHERE id=$1',[userId,data.name]);
      if(data.image!==undefined)await client.query('UPDATE "user" SET image=$2,"updatedAt"=now() WHERE id=$1',[userId,data.image]);
      const {rows}=await client.query(`SELECT ${userColumns} FROM "user" u LEFT JOIN sahne_profiles pr ON pr.user_id=u.id WHERE u.id=$1`,[userId]);
      return {user:publicUser(rows[0])};
    }
    case 'librarySync':return syncLibrary(client,userId,data);
    case 'rate': {
      await lockLibrary(client,userId);
      await ensureShow(client,data.showId,data.show);
      await setRating(client,userId,data.showId,data.rating);
      const version=await bumpLibrary(client,userId),summary=await ratingSummary(client,data.showId,userId);
      return {showId:data.showId,rating:data.rating,average:summary.average,count:summary.count,version};
    }
    case 'log': {
      await lockLibrary(client,userId);
      await ensureShow(client,data.showId,data.show);
      const entry={status:'done',...(data.watchedAt?{date:data.watchedAt}:{})};
      await client.query(`INSERT INTO sahne_library(user_id,show_id,entry) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(user_id,show_id) DO UPDATE SET entry=sahne_library.entry||EXCLUDED.entry,updated_at=now()`,[userId,data.showId,JSON.stringify(entry)]);
      if(data.rating!==undefined)await setRating(client,userId,data.showId,data.rating);
      const item=await insertPost(client,userId,'log',data),version=await bumpLibrary(client,userId);
      return {item,version};
    }
    case 'createTopic':return {item:await insertPost(client,userId,'topic',data)};
    case 'reply':return {item:await insertPost(client,userId,'reply',data)};
    case 'comment':return {item:await insertPost(client,userId,'comment',data)};
    case 'follow': {
      const target=await getUser(client,data.username);
      if(target.id===userId)throw new ApiError(400,'SELF_FOLLOW','Kendini takip edemezsin.');
      if(data.following){
        const result=await client.query('INSERT INTO sahne_follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING follower_id',[userId,target.id]);
        if(result.rowCount)await notify(client,target.id,userId,'follow');
      }else {
        await client.query('DELETE FROM sahne_follows WHERE follower_id=$1 AND following_id=$2',[userId,target.id]);
        await client.query("DELETE FROM sahne_notifications WHERE recipient_id=$1 AND actor_id=$2 AND kind='follow'",[target.id,userId]);
      }
      const {rows}=await client.query('SELECT count(*)::integer AS count FROM sahne_follows WHERE following_id=$1',[target.id]);
      return {following:data.following,followerCount:rows[0].count};
    }
    case 'like': {
      const post=await getPost(client,data.postId,userId);
      if(data.liked){
        const result=await client.query('INSERT INTO sahne_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',[userId,data.postId]);
        if(result.rowCount)await notify(client,post.user.id,userId,'like',data.postId);
      }else {
        await client.query('DELETE FROM sahne_likes WHERE user_id=$1 AND post_id=$2',[userId,data.postId]);
        await client.query("DELETE FROM sahne_notifications WHERE actor_id=$1 AND post_id=$2 AND kind='like'",[userId,data.postId]);
      }
      const {rows}=await client.query('SELECT count(*)::integer AS count FROM sahne_likes WHERE post_id=$1',[data.postId]);
      return {postId:data.postId,liked:data.liked,likeCount:rows[0].count};
    }
    case 'report': {
      await getPost(client,data.postId,userId);
      await client.query(`INSERT INTO sahne_reports(user_id,post_id,reason) VALUES($1,$2,$3) ON CONFLICT(user_id,post_id) DO UPDATE SET reason=EXCLUDED.reason`,[userId,data.postId,data.reason]);
      return {reported:true};
    }
    case 'deleteOwn': {
      const result=await client.query(`UPDATE sahne_posts SET deleted_at=now(),updated_at=now(),body='',title=NULL WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`,[data.postId,userId]);
      if(!result.rowCount){
        const {rows}=await client.query('SELECT user_id FROM sahne_posts WHERE id=$1',[data.postId]);
        if(rows.length&&rows[0].user_id!==userId)throw new ApiError(403,'FORBIDDEN','Yalnız kendi paylaşımını silebilirsin.');
        throw new ApiError(404,'NOT_FOUND','Bu paylaşım bulunamadı.');
      }
      await client.query('DELETE FROM sahne_notifications WHERE post_id=$1',[data.postId]);
      return {deleted:true};
    }
    case 'readNotifications': {
      await client.query('UPDATE sahne_notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL',[userId]);
      return {read:true};
    }
  }
}
async function readAction(request,userId) {
  const params=new URL(request.url).searchParams,action=params.get('action')||'feed';
  switch(action) {
    case 'me': {
      if(!userId)return {user:null};
      const {rows}=await query(`SELECT ${userColumns} FROM "user" u LEFT JOIN sahne_profiles pr ON pr.user_id=u.id WHERE u.id=$1`,[userId]);
      return {user:rows.length?publicUser(rows[0]):null};
    }
    case 'profile': {
      const usernameValue=params.get('username');
      if(!usernameValue||usernameValue.length>30)throw new ApiError(400,'INVALID_INPUT','Kullanıcı adı gerekli.');
      return profile(database,usernameValue,userId);
    }
    case 'library':if(!userId)throw new ApiError(401,'UNAUTHENTICATED','Arşivin için giriş yap.');return getLibrary(database,userId);
    case 'notifications':if(!userId)throw new ApiError(401,'UNAUTHENTICATED','Bildirimlerin için giriş yap.');return notifications(database,userId,params);
    case 'topic': {
      const id=params.get('id');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw new ApiError(400,'INVALID_INPUT','Tartışma kimliği geçersiz.');
      const topic=await getPost(database,id,userId);
      if(topic.kind!=='topic')throw new ApiError(404,'NOT_FOUND','Bu tartışma bulunamadı.');
      const page=await listPosts(database,userId,params,[['p.topic_id=?',id]]);
      return {topic,replies:page.items,nextCursor:page.nextCursor};
    }
    case 'feed':case 'topics':case 'comments': {
      const filters=action==='topics'?[["p.kind=?",'topic']]:action==='comments'?[["p.kind=?",'comment']]:[["p.kind=ANY(?::text[])",['log','topic','comment']]];
      if(action==='comments'||params.has('showId'))filters.push(['p.show_id=?',numericShowId(params.get('showId'))]);
      if(params.has('username')){const user=await getUser(database,params.get('username'));filters.push(['p.user_id=?',user.id]);}
      if(params.get('following')==='true'){
        if(!userId)throw new ApiError(401,'UNAUTHENTICATED','Takip akışın için giriş yap.');
        filters.push(['(p.user_id=? OR p.user_id IN (SELECT following_id FROM sahne_follows WHERE follower_id=$1))',userId]);
      }
      if(params.has('category'))filters.push(['p.category=?',params.get('category')]);
      if(params.has('q')){
        const text=params.get('q').trim();
        if(text.length>180)throw new ApiError(400,'INVALID_INPUT','Arama en fazla 180 karakter olabilir.');
        if(text)filters.push(["concat_ws(' ',p.title,p.body) ILIKE ? ESCAPE E'\\\\'",`%${text.replace(/[\\%_]/g,'\\$&')}%`]);
      }
      const page=await listPosts(database,userId,params,filters);
      if(action==='comments')page.rating=await ratingSummary(database,numericShowId(params.get('showId')),userId);
      return page;
    }
    default:throw new ApiError(400,'INVALID_ACTION','Bu sorgu tanınmıyor.');
  }
}
async function readJson(request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError(415,'JSON_REQUIRED','JSON içerik türü gerekli.');
  const maximum=2*1024*1024;
  if(Number(request.headers.get('content-length'))>maximum)throw new ApiError(413,'TOO_LARGE','Arşiv isteği çok büyük.');
  const reader=request.body?.getReader();
  if(!reader)throw new ApiError(400,'INVALID_INPUT','İstek gövdesi gerekli.');
  let bytes=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maximum){await reader.cancel();throw new ApiError(413,'TOO_LARGE','Arşiv isteği çok büyük.');}chunks.push(Buffer.from(value));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'INVALID_JSON','İstek gövdesi geçerli JSON olmalı.');}
}
async function avatarResponse(request) {
  const params=new URL(request.url).searchParams,id=params.get('id');
  if(!id||id.length>128)throw new ApiError(400,'INVALID_INPUT','Görsel kimliği geçersiz.');
  const {rows}=await query('SELECT image FROM "user" WHERE id=$1',[id]);
  const value=rows[0]?.image;
  if(!value?.startsWith('data:')||!avatarSchema.safeParse(value).success)throw new ApiError(404,'NOT_FOUND','Bu görsel bulunamadı.');
  const match=/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/.exec(value);
  const etag=`"${createHash('sha256').update(value).digest('hex').slice(0,16)}"`;
  const headers={'Content-Type':match[1],'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff',ETag:etag};
  if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
  return new Response(Buffer.from(match[2],'base64'),{headers});
}
export async function communityHandler(request) {
  try {
    if(!['GET','POST'].includes(request.method))return json({error:{code:'METHOD_NOT_ALLOWED',message:'Bu yöntem desteklenmiyor.'}},405);
    if(request.method==='GET'&&new URL(request.url).searchParams.get('action')==='avatar')return await avatarResponse(request);
    if(request.method==='POST') {
      const origin=request.headers.get('origin');
      if(!origin||!trustedOrigins.includes(origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'INVALID_ORIGIN','Bu kaynaktan işlem yapılamaz.');
    }
    const session=await auth.api.getSession({headers:request.headers});
    const userId=session?.user?.id||null;
    if(request.method==='GET')return json(await readAction(request,userId));
    if(!userId)throw new ApiError(401,'UNAUTHENTICATED','Bu işlem için giriş yap.');
    const {action,data}=parseMutation(await readJson(request));
    // An atomic rate counter is separate from the write transaction, so rejected writes cannot roll it back.
    await checkWriteLimit(database,userId);
    return json(await transaction(client=>mutate(client,userId,action,data)));
  } catch(error) {
    if(error instanceof ApiError)return json({error:{code:error.code,message:error.message,...(error.details?{details:error.details}:{})}},error.status);
    // Error objects can contain connection credentials or submitted content. Log only a bounded category.
    console.error('Community request failed:', /^[A-Z0-9_]{2,30}$/.test(error.code||'')?error.code:error.name||'Error');
    return json({error:{code:'INTERNAL_ERROR',message:'İşlem tamamlanamadı. Lütfen yeniden dene.'}},500);
  }
}
