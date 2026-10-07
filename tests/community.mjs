import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Real HTTP integration tests. Use the local dev server and its database only.
// Every account is unique to this run; cleanup deletes only its exact user IDs.
const base = new URL(process.env.BASE_URL || 'http://localhost:4182');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Community tests require a local BASE_URL.');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for exact test-account cleanup.');
const runId = Date.now().toString(36) + randomBytes(5).toString('hex');
const privateNoteA = `PRIVATE-NOTE-A-${runId}`;
const privateNoteB = `PRIVATE-NOTE-B-${runId}`;
const results = [];
const actors = ['a', 'b'].map(suffix => ({
  name: `Sahne QA ${runId} ${suffix}`,
  username: `qa${runId}${suffix}`,
  email: `sahne-qa-${runId}-${suffix}@example.invalid`,
  password: `SahneQA!${randomBytes(18).toString('hex')}`,
  id: null,
  attempted: false,
}));
const fixtureManifest = path.join(tmpdir(), `sahne-community-fixtures-${runId}.json`);
async function rememberFixtures() {
  // An interrupted run can be cleaned by its recorded exact IDs, never by a broad email prefix.
  await writeFile(fixtureManifest, JSON.stringify({ runId, actors: actors.map(({ id, email, name, attempted }) => ({ id, email, name, attempted })) }, null, 2), { mode: 0o600 });
}

class Client {
  constructor() { this.cookies = new Map(); this.httpOnlySession = false; }
  cookieHeader() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
  async request(path, { method = 'GET', body, expect = [200], origin = base.origin } = {}) {
    const headers = { Accept: 'application/json' };
    if (origin !== null) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    const response = await fetch(new URL(path, base), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual', signal: AbortSignal.timeout(25_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0], split = pair.indexOf('=');
      const key = pair.slice(0, split), value = pair.slice(split + 1);
      if (!value || /max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(key);
      else this.cookies.set(key, value);
      if (/session_token/i.test(key) && /;\s*httponly(?:;|$)/i.test(cookie)) this.httpOnlySession = true;
    }
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { throw new Error(`${method} ${new URL(path, base).pathname} did not return JSON (${response.status}).`); }
    assert.ok(expect.includes(response.status), `${method} ${new URL(path, base).pathname}: expected ${expect.join('/')} but received ${response.status}; code=${data?.code || data?.error?.code || 'unknown'}`);
    return { status: response.status, data };
  }
  async get(action, query = {}, options = {}) {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
    return (await this.request(`/api/community?${params}`, options)).data;
  }
  async post(action, payload = {}, options = {}) {
    return (await this.request('/api/community', { method: 'POST', body: { action, ...payload }, ...options })).data;
  }
}
const [a, b] = [new Client(), new Client()];
const anonymous = new Client();

function safeError(error) {
  let message = String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[database URL]');
  for (const actor of actors) for (const secret of [actor.password, actor.email, ...a.cookies.values(), ...b.cookies.values()]) {
    if (secret) message = message.replaceAll(secret, '[redacted]');
  }
  for (const [key, value] of Object.entries(process.env)) if (value && /SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(key)) message = message.replaceAll(value, '[redacted]');
  return message.slice(0, 1200);
}
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); return true; }
  catch (error) { results.push({ name, pass: false, error: safeError(error) }); console.error(`FAIL ${name}: ${safeError(error)}`); return false; }
}
function assertPublic(data) {
  const prohibited = new Set(['email', 'emailverified', 'password', 'passwordhash', 'secret', 'session', 'sessiontoken', 'token', 'accesstoken', 'refreshtoken', 'ipaddress', 'useragent', 'databaseurl']);
  function walk(value, at = 'response') {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!prohibited.has(key.replaceAll('_', '').toLowerCase()), `Public response includes a prohibited field at ${at}.${key}.`);
      walk(item, `${at}.${key}`);
    }
  }
  walk(data);
  const serialized = JSON.stringify(data);
  for (const value of [...actors.map(actor => actor.email), privateNoteA, privateNoteB]) assert.ok(!serialized.includes(value), 'Public response contains an account email or a private journal note.');
}
function assertItem(items, id, properties = {}) {
  assert.ok(Array.isArray(items), 'Expected a paginated items array.');
  const item = items.find(row => row.id === id);
  assert.ok(item, 'Expected test item was not returned.');
  for (const [key, value] of Object.entries(properties)) assert.equal(item[key], value, `Incorrect ${key} on returned item.`);
  return item;
}
const snapshot = value => ({ entries: value.entries, lists: value.lists, ratings: value.ratings, shows: value.shows, version: value.version });
const seedText = await readFile(new URL('../catalog-seed.js', import.meta.url), 'utf8');
const seed = JSON.parse(seedText.slice(seedText.indexOf('=') + 1).trim().replace(/;$/, ''));
function show(id) {
  const raw = seed.shows.find(row => row.id === id);
  assert.ok(raw, 'Test show is absent from the real catalog.');
  return { id: raw.id, name: raw.name, image: raw.image?.medium || null, hero: raw.image?.original || null, genres: raw.genres, year: Number(raw.premiered?.slice(0, 4)) || null };
}
const severance = show(44933), bear = show(54198);
let aLibrary, bLibrary, ratingShow, topicId, replyId, commentId, logId;

try {
  const setup = await test('Real BetterAuth signup, cookie sessions, logout and email/username login', async () => {
    assert.equal((await anonymous.get('me')).user, null);
    for (const [client, actor] of [[a, actors[0]], [b, actors[1]]]) {
      actor.attempted = true;
      await rememberFixtures();
      const signed = (await client.request('/api/auth/sign-up/email', { method: 'POST', body: { name: actor.name, username: actor.username, email: actor.email, password: actor.password }, expect: [200, 201] })).data;
      actor.id = signed.user?.id;
      await rememberFixtures();
      assert.ok(typeof actor.id === 'string' && actor.id.length > 0, 'Signup did not create a user ID.');
      assert.ok(client.httpOnlySession, 'The auth session cookie must be HttpOnly.');
      const session = (await client.request('/api/auth/get-session')).data;
      assert.equal(session.user.id, actor.id);
      assert.equal((await client.get('me')).user.id, actor.id);
    }
    assert.notEqual(actors[0].id, actors[1].id);
    assert.ok(a.cookieHeader() !== b.cookieHeader(), 'Accounts must not share a cookie session.');
    await a.request('/api/auth/sign-out', { method: 'POST', body: {} });
    assert.equal((await a.request('/api/auth/get-session')).data, null);
    await a.request('/api/auth/sign-in/email', { method: 'POST', body: { email: actors[0].email, password: actors[0].password } });
    assert.equal((await a.request('/api/auth/get-session')).data.user.id, actors[0].id);
    await b.request('/api/auth/sign-out', { method: 'POST', body: {} });
    await b.request('/api/auth/sign-in/username', { method: 'POST', body: { username: actors[1].username, password: actors[1].password } });
    assert.equal((await b.request('/api/auth/get-session')).data.user.id, actors[1].id);
    const badLogin = new Client();
    await badLogin.request('/api/auth/sign-in/email', { method: 'POST', body: { email: actors[0].email, password: 'Definitely-not-the-test-password' }, expect: [401] });
    assert.equal((await badLogin.get('me')).user, null);
  });
  assert.ok(setup, 'Authentication fixtures could not be created; dependent tests were not run.');

  await test('Rewritten auth routes preserve GET/POST bodies and cookies and reject unsafe paths', async () => {
    const routed = new Client();
    const route = authPath => `/api/auth-router?${new URLSearchParams({ authPath })}`;
    const signed = (await routed.request(route('sign-in/email'), { method: 'POST', body: { email: actors[0].email, password: actors[0].password } })).data;
    assert.equal(signed.user.id, actors[0].id);
    assert.ok(routed.httpOnlySession, 'Rewritten auth must preserve the HttpOnly session cookie.');
    assert.equal((await routed.request(route('get-session'))).data.user.id, actors[0].id);
    assert.equal((await routed.get('me')).user.id, actors[0].id);
    for (const invalid of ['../get-session', 'https://invalid.example/get-session']) await routed.request(route(invalid), { expect: [400] });
    await routed.request('/api/auth-router', { expect: [400] });
    await routed.request(route('sign-out'), { method: 'POST', body: {} });
    assert.equal((await routed.request(route('get-session'))).data, null);
    assert.equal((await a.get('me')).user.id, actors[0].id);
  });

  await test('Anonymous callers cannot read private library/notifications or perform any mutation', async () => {
    await anonymous.get('library', {}, { expect: [401] });
    await anonymous.get('notifications', {}, { expect: [401] });
    const posts = [
      ['updateProfile', { name: 'No session' }], ['follow', { username: actors[0].username, following: true }],
      ['log', { showId: severance.id, show: severance }],
      ['librarySync', { entries: {}, lists: [], ratings: {}, shows: [], version: 0 }],
      ['rate', { showId: severance.id, show: severance, rating: 8 }],
      ['createTopic', { showId: bear.id, show: bear, title: 'Anonymous test', body: 'Must be rejected.' }],
      ['reply', { topicId: randomUUID(), body: 'Must be rejected.' }],
      ['comment', { showId: bear.id, show: bear, body: 'Must be rejected.' }],
      ['like', { postId: randomUUID(), liked: true }], ['report', { postId: randomUUID(), reason: 'QA test only' }],
      ['deleteOwn', { postId: randomUUID() }], ['readNotifications', {}],
    ];
    for (const [action, payload] of posts) await anonymous.post(action, payload, { expect: [401] });
  });

  await test('Account library snapshots are isolated, durable and have versioned conflict protection', async () => {
    aLibrary = await a.get('library'); bLibrary = await b.get('library');
    assert.deepEqual(aLibrary.entries, {}); assert.deepEqual(bLibrary.entries, {});
    const aListId = `qa_${runId}_a`, bListId = `qa_${runId}_b`;
    const aData = { entries: { [severance.id]: { status: 'watching', review: privateNoteA, date: '2026-10-06', rating: 7.5, favorite: true, lists: [aListId], episodes: [1], spoiler: true } }, lists: [{ id: aListId, name: 'QA A list', description: 'Account A' }], ratings: { [severance.id]: 'love' }, shows: [severance], version: aLibrary.version };
    aLibrary = await a.post('librarySync', aData);
    assert.equal(aLibrary.version, aData.version + 1);
    assert.equal(aLibrary.entries[severance.id].review, privateNoteA);
    assert.deepEqual((await b.get('library')).entries, {});
    const bData = { entries: { [severance.id]: { status: 'done', review: privateNoteB, rating: 2, lists: [bListId] } }, lists: [{ id: bListId, name: 'QA B list' }], ratings: { [severance.id]: 'dislike' }, shows: [severance], version: bLibrary.version };
    bLibrary = await b.post('librarySync', bData);
    assert.equal(bLibrary.version, bData.version + 1);
    assert.equal((await a.get('library')).entries[severance.id].review, privateNoteA);
    assert.equal((await b.get('library')).entries[severance.id].review, privateNoteB);
    const stale = await a.post('librarySync', { ...aData, entries: {} }, { expect: [409] });
    assert.equal(stale.code || stale.error?.code, 'VERSION_CONFLICT');
    assert.equal((await a.get('library')).entries[severance.id].review, privateNoteA);
    assert.equal((await b.get('library')).entries[severance.id].rating, 2);
  });

  await test('Library schemas reject undeclared list references, invalid dates/types and ownership spoofing atomically', async () => {
    const current = await a.get('library'), valid = snapshot(current);
    const invalidEntries = [
      { ...valid.entries[severance.id], status: 'admin' },
      { ...valid.entries[severance.id], date: '2026-02-30' },
      { ...valid.entries[severance.id], rating: '8' },
      { ...valid.entries[severance.id], favorite: 'false' },
      { ...valid.entries[severance.id], lists: ['not_an_owned_list'] },
      { ...valid.entries[severance.id], userId: actors[1].id },
    ];
    for (const entry of invalidEntries) await a.post('librarySync', { ...valid, entries: { [severance.id]: entry } }, { expect: [400] });
    await a.post('librarySync', { ...valid, userId: actors[1].id }, { expect: [400] });
    assert.deepEqual(await a.get('library'), current);
    const spoofedRead = await b.get('library', { userId: actors[0].id }, { expect: [200, 400] });
    if (spoofedRead.entries) {
      assert.equal(spoofedRead.entries[severance.id].review, privateNoteB);
      assert.ok(!JSON.stringify(spoofedRead).includes(privateNoteA));
    }
    assert.equal((await a.get('library')).entries[severance.id].review, privateNoteA);
  });

  await test('Public profiles and feeds exclude auth secrets and private library review text', async () => {
    for (const actor of actors) {
      const profile = await anonymous.get('profile', { username: actor.username });
      assert.equal(profile.user.username, actor.username);
      assertPublic(profile);
    }
    for (const action of ['feed', 'topics', 'comments']) assertPublic(await anonymous.get(action, action === 'feed' ? {} : { showId: severance.id }));
  });

  await test('Two users rate independently with half steps, stable counts, update and null delete', async () => {
    for (const id of [38052, 17861, 305, 1871]) {
      const candidate = show(id), current = await anonymous.get('comments', { showId: id });
      if (current.rating.count === 0) { ratingShow = candidate; break; }
    }
    assert.ok(ratingShow, 'No unused factual test show was available for the rating aggregate test.');
    await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 1 });
    const boundaries = await b.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 10 });
    assert.equal(boundaries.count, 2); assert.equal(boundaries.average, 5.5);
    await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 9 });
    const second = await b.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 3.5 });
    assert.equal(second.count, 2); assert.equal(second.average, 6.25);
    assert.equal((await a.get('comments', { showId: ratingShow.id })).rating.yourRating, 9);
    assert.equal((await b.get('comments', { showId: ratingShow.id })).rating.yourRating, 3.5);
    assert.equal((await anonymous.get('comments', { showId: ratingShow.id })).rating.yourRating, null);
    const changed = await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 8 });
    assert.equal(changed.count, 2); assert.equal(changed.average, 5.75);
    const repeated = await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 8 });
    assert.equal(repeated.count, 2); assert.equal(repeated.average, 5.75);
    const cleared = await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: null });
    assert.equal(cleared.count, 1); assert.equal(cleared.average, 3.5);
    assert.equal((await a.get('comments', { showId: ratingShow.id })).rating.yourRating, null);
    await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 9 });
  });

  await test('Rating validation is server-side and rejects invalid numeric values and spoofed identifiers', async () => {
    assert.ok(ratingShow, 'Rating fixture was not created.');
    for (const rating of [0, 10.5, 1.25, '8', true, {}]) await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating }, { expect: [400] });
    await a.post('rate', { showId: ratingShow.id, show: ratingShow }, { expect: [400] });
    await a.post('rate', { showId: ratingShow.id, show: ratingShow, rating: 7, userId: actors[1].id }, { expect: [400] });
    await a.post('rate', { showId: -1, rating: 7 }, { expect: [400] });
    await a.post('rate', { showId: bear.id, show: severance, rating: 7 }, { expect: [400] });
    assert.equal((await a.get('comments', { showId: ratingShow.id })).rating.yourRating, 9);
    assert.equal((await b.get('comments', { showId: ratingShow.id })).rating.yourRating, 3.5);
  });

  await test('Mutation origin and profile URL validation block unsafe cross-origin requests', async () => {
    await a.post('updateProfile', { name: actors[0].name }, { origin: 'https://invalid-origin.example', expect: [403] });
    await a.post('updateProfile', { name: actors[0].name }, { origin: null, expect: [403] });
    await a.post('updateProfile', { image: 'javascript:alert(1)' }, { expect: [400] });
    await a.post('updateProfile', { image: 'https://user:password@example.invalid/avatar.jpg' }, { expect: [400] });
    await a.post('updateProfile', { name: 'Spoofed account', userId: actors[1].id }, { expect: [400] });
    assert.equal((await anonymous.get('profile', { username: actors[1].username })).user.name, actors[1].name);
  });

  await test('Topics, comments and replies preserve spoiler flags and publish only public DTOs', async () => {
    const topic = await a.post('createTopic', { showId: bear.id, show: bear, title: `QA theory ${runId}`, body: `PUBLIC-TOPIC-${runId}`, spoiler: true, category: 'theory' });
    topicId = topic.item.id; assert.ok(topicId); assert.equal(topic.item.spoiler, true); assertPublic(topic);
    const reply = await b.post('reply', { topicId, body: `PUBLIC-REPLY-${runId}`, spoiler: false });
    replyId = reply.item.id; assert.equal(reply.item.spoiler, false); assertPublic(reply);
    const comment = await a.post('comment', { showId: bear.id, show: bear, body: `PUBLIC-COMMENT-${runId}`, spoiler: true });
    commentId = comment.item.id; assert.equal(comment.item.spoiler, true); assertPublic(comment);
    const topics = await anonymous.get('topics', { showId: bear.id }); assertItem(topics.items, topicId, { spoiler: true }); assertPublic(topics);
    const thread = await anonymous.get('topic', { id: topicId }); assert.equal(thread.topic.id, topicId); assert.equal(thread.topic.spoiler, true); assertItem(thread.replies, replyId, { spoiler: false }); assertPublic(thread);
    const comments = await anonymous.get('comments', { showId: bear.id }); assertItem(comments.items, commentId, { spoiler: true }); assertPublic(comments);
  });

  await test('Avatar upload returns a compact public URL and serves exact PNG bytes safely', async () => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const uploaded = await a.post('updateProfile', { image: `data:image/png;base64,${bytes.toString('base64')}` });
    const imageUrl = new URL(uploaded.user.image, base);
    assert.equal(imageUrl.origin, base.origin);
    assert.equal(imageUrl.pathname, '/api/community');
    assert.equal(imageUrl.searchParams.get('action'), 'avatar');
    assert.equal(imageUrl.searchParams.get('id'), actors[0].id);
    assert.ok(imageUrl.searchParams.get('v'));
    assertPublic(uploaded);
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(25_000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const etag = response.headers.get('etag'); assert.ok(etag);
    const unchanged = await fetch(imageUrl, { headers: { 'If-None-Match': etag }, signal: AbortSignal.timeout(25_000) });
    assert.equal(unchanged.status, 304);
    const publiclyVisible = await b.get('profile', { username: actors[0].username });
    assert.equal(publiclyVisible.user.image, uploaded.user.image); assertPublic(publiclyVisible);
    const oversized = Buffer.alloc(250001); bytes.copy(oversized);
    await a.post('updateProfile', { image: `data:image/png;base64,${oversized.toString('base64')}` }, { expect: [400] });
    await a.post('updateProfile', { image: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' }, { expect: [400] });
    assert.equal((await anonymous.get('profile', { username: actors[0].username })).user.image, uploaded.user.image);
    await anonymous.get('avatar', { id: `not-a-user-${runId}` }, { expect: [404] });
  });

  await test('General topics and replies support a null show without weakening ownership', async () => {
    const created = await a.post('createTopic', { title: `QA general ${runId}`, body: 'A general discussion without a show.', category: 'question', spoiler: false });
    assert.equal(created.item.show, null);
    const replied = await b.post('reply', { topicId: created.item.id, body: 'A general reply without a show.', spoiler: true });
    assert.equal(replied.item.show, null); assert.equal(replied.item.spoiler, true);
    const thread = await anonymous.get('topic', { id: created.item.id });
    assertItem(thread.replies, replied.item.id, { spoiler: true }); assertPublic(thread);
    await b.post('deleteOwn', { postId: created.item.id }, { expect: [403, 404] });
    await a.post('deleteOwn', { postId: created.item.id });
    await anonymous.get('topic', { id: created.item.id }, { expect: [404] });
  });

  await test('Forum schemas reject empty/oversized/invalid fields and forged author IDs', async () => {
    const valid = { showId: bear.id, show: bear, title: `QA valid ${runId}`, body: 'A valid test body.', spoiler: false, category: 'general' };
    for (const override of [{ title: '  ' }, { title: 'x'.repeat(181) }, { body: '  ' }, { body: 'x'.repeat(5001) }, { spoiler: 'false' }, { category: 'admin' }, { userId: actors[1].id }]) await a.post('createTopic', { ...valid, ...override }, { expect: [400] });
    await a.post('createTopic', { ...valid, show: severance }, { expect: [400] });
    await b.post('reply', { topicId, body: '  ' }, { expect: [400] });
    await b.post('reply', { topicId: 'not-a-uuid', body: 'Invalid topic.' }, { expect: [400] });
    await b.post('reply', { topicId: randomUUID(), body: 'Missing topic.' }, { expect: [404] });
    await b.post('comment', { showId: bear.id, show: bear, body: 'Spoofed author.', authorId: actors[0].id }, { expect: [400] });
    await anonymous.get('topics', { showId: bear.id, limit: 0 }, { expect: [400] });
    await anonymous.get('topics', { showId: bear.id, cursor: 'bad-cursor' }, { expect: [400] });
  });

  await test('Log publication is explicit and never publishes a private journal review', async () => {
    const watchedAt = '2026-10-07';
    const logged = await a.post('log', { showId: severance.id, show: severance, watchedAt, body: `PUBLIC-LOG-${runId}`, spoiler: true, rating: 8.5 });
    logId = logged.item.id; assert.equal(logged.item.spoiler, true); assert.equal(logged.item.watchedAt, watchedAt); assertPublic(logged);
    const feed = await anonymous.get('feed'); assertItem(feed.items, logId, { spoiler: true, watchedAt }); assertPublic(feed);
    const profile = await anonymous.get('profile', { username: actors[0].username }); assertItem(profile.logs, logId, { watchedAt }); assertPublic(profile);
    const own = await a.get('library');
    assert.equal(own.entries[severance.id].date, watchedAt);
    assert.equal(own.entries[severance.id].review, privateNoteA);
    assert.equal((await b.get('library')).entries[severance.id].review, privateNoteB);
  });

  await test('Leap-day and DST-boundary calendar dates roundtrip without timezone shifts', async () => {
    for (const watchedAt of ['2024-02-29', '2026-03-29', '2026-10-25']) {
      const logged = await a.post('log', { showId: severance.id, show: severance, watchedAt, body: `PUBLIC-DATE-${runId}-${watchedAt}` });
      assert.equal(logged.item.watchedAt, watchedAt);
      const feed = await anonymous.get('feed', { username: actors[0].username });
      assertItem(feed.items, logged.item.id, { watchedAt });
      const profile = await anonymous.get('profile', { username: actors[0].username });
      assertItem(profile.logs, logged.item.id, { watchedAt });
      assert.equal((await a.get('library')).entries[severance.id].date, watchedAt);
    }
  });

  await test('Follow and like writes are idempotent and following feed is session-specific', async () => {
    const followed = await b.post('follow', { username: actors[0].username, following: true });
    assert.equal(followed.following, true);
    const again = await b.post('follow', { username: actors[0].username, following: true }); assert.equal(again.followerCount, followed.followerCount);
    const ownFollowing = await b.get('feed', { following: true }); assertItem(ownFollowing.items, logId); assertPublic(ownFollowing);
    const liked = await b.post('like', { postId: commentId, liked: true }); assert.equal(liked.likeCount, 1); assert.equal(liked.liked, true);
    const likedAgain = await b.post('like', { postId: commentId, liked: true }); assert.equal(likedAgain.likeCount, 1);
    const unliked = await b.post('like', { postId: commentId, liked: false }); assert.equal(unliked.likeCount, 0);
    const stopped = await b.post('follow', { username: actors[0].username, following: false }); assert.equal(stopped.following, false); assert.equal(stopped.followerCount, followed.followerCount - 1);
    const noLongerFollowing = await b.get('feed', { following: true }); assert.ok(!noLongerFollowing.items.some(item => item.id === logId));
    const alerts = await a.get('notifications'); assert.ok(Array.isArray(alerts.items)); assert.ok(alerts.unreadCount > 0);
    await a.post('readNotifications'); assert.equal((await a.get('notifications')).unreadCount, 0);
    const bAlerts = await b.get('notifications', { userId: actors[0].id }); assert.equal(bAlerts.unreadCount, 0);
  });

  await test('Only the owner can delete content; reports and public reads retain ownership isolation', async () => {
    await b.post('deleteOwn', { postId: commentId }, { expect: [403, 404] });
    assertItem((await anonymous.get('comments', { showId: bear.id })).items, commentId);
    const reported = await b.post('report', { postId: commentId, reason: 'QA report; cleanup follows.' }); assert.equal(reported.reported, true);
    await b.post('deleteOwn', { postId: replyId });
    assert.ok(!(await anonymous.get('topic', { id: topicId })).replies.some(item => item.id === replyId));
    await a.post('deleteOwn', { postId: topicId });
    await anonymous.get('topic', { id: topicId }, { expect: [404] });
    assertItem((await anonymous.get('comments', { showId: bear.id })).items, commentId);
    await a.post('deleteOwn', { postId: commentId });
    assert.ok(!(await anonymous.get('comments', { showId: bear.id })).items.some(item => item.id === commentId));
  });

  await test('Independent login sessions reload only their own stored library', async () => {
    const freshA = new Client(), freshB = new Client();
    for (const [client, actor] of [[freshA, actors[0]], [freshB, actors[1]]]) await client.request('/api/auth/sign-in/email', { method: 'POST', body: { email: actor.email, password: actor.password } });
    const loadedA = await freshA.get('library'), loadedB = await freshB.get('library');
    assert.equal(loadedA.entries[severance.id].review, privateNoteA);
    assert.equal(loadedB.entries[severance.id].review, privateNoteB);
    assert.ok(!JSON.stringify(loadedA).includes(privateNoteB)); assert.ok(!JSON.stringify(loadedB).includes(privateNoteA));
    await freshA.request('/api/auth/sign-out', { method: 'POST', body: {} });
    await freshA.get('library', {}, { expect: [401] });
    assert.equal((await freshB.get('library')).entries[severance.id].review, privateNoteB);
  });
} catch (error) {
  results.push({ name: 'Integration setup', pass: false, error: safeError(error) });
  console.error(`FAIL Integration setup: ${safeError(error)}`);
} finally {
  await test('Cleanup deletes only the exact generated test accounts (FK cascades)', async () => {
    const attempted = actors.filter(actor => actor.attempted);
    if (!attempted.length) return;
    const { query, pool } = await import('../server/db.js');
    try {
      for (const actor of attempted) {
        assert.ok(actor.email === `sahne-qa-${runId}-${actor.username.endsWith('a') ? 'a' : 'b'}@example.invalid`, 'Cleanup fixture email did not belong to this run.');
        if (!actor.id) {
          const found = await query('SELECT id FROM "user" WHERE email=$1 AND name=$2', [actor.email, actor.name]);
          assert.ok(found.rows.length <= 1, 'Cleanup account lookup was ambiguous.');
          actor.id = found.rows[0]?.id || null;
        }
        if (!actor.id) continue;
        const deleted = await query('DELETE FROM "user" WHERE id=$1 AND email=$2 RETURNING id', [actor.id, actor.email]);
        assert.ok(deleted.rows.length <= 1, 'Cleanup affected unexpected accounts.');
        const remains = await query('SELECT id FROM "user" WHERE id=$1', [actor.id]);
        assert.equal(remains.rows.length, 0, 'Generated test account remained after cleanup.');
      }
      const ids = attempted.map(actor => actor.id).filter(Boolean);
      if (ids.length) {
        const cascade = await query(`SELECT
          (SELECT count(*) FROM sahne_posts WHERE user_id=ANY($1::text[])) AS posts,
          (SELECT count(*) FROM sahne_library WHERE user_id=ANY($1::text[])) AS library,
          (SELECT count(*) FROM sahne_ratings WHERE user_id=ANY($1::text[])) AS ratings,
          (SELECT count(*) FROM sahne_follows WHERE follower_id=ANY($1::text[]) OR following_id=ANY($1::text[])) AS follows,
          (SELECT count(*) FROM sahne_notifications WHERE recipient_id=ANY($1::text[]) OR actor_id=ANY($1::text[])) AS notifications`, [ids]);
        for (const value of Object.values(cascade.rows[0])) assert.equal(Number(value), 0, 'A generated user row survived FK cleanup.');
      }
      await rm(fixtureManifest, { force: true });
    } finally { await pool.end(); }
  });
}
const passed = results.filter(row => row.pass).length, failed = results.length - passed;
console.log(JSON.stringify({ passed, failed, tests: results }, null, 2));
process.exitCode = failed ? 1 : 0;
