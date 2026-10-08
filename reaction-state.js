'use strict';
(() => {
  const fields = ['status', 'date', 'episodes'];
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const snapshot = entry => Object.fromEntries(fields.map(key => [key, copy(entry?.[key])]));
  const matches = (entry, plan) => !!entry && fields.every(key => JSON.stringify(entry[key]) === JSON.stringify(plan.after[key]));
  const aired = (episodes, date) => episodes.filter(ep => ep.airdate && ep.airdate <= date && Number.isInteger(ep.id) && ep.id > 0).map(ep => ep.id);
  function complete(entry, episodes, date) {
    if (entry?.status === 'done') return null;
    const before = snapshot(entry);
    const next = {...entry, status: 'done', date: entry?.date || date};
    const ids = aired(episodes, date);
    if (ids.length) next.episodes = [...new Set([...(entry?.episodes || []), ...ids])];
    return {before, after: snapshot(next), entry: next};
  }
  function extend(entry, plan, episodes, date) {
    if (!matches(entry, plan)) return false;
    const ids = aired(episodes, date);
    if (!ids.length) return false;
    entry.episodes = [...new Set([...(entry.episodes || []), ...ids])];
    plan.after = snapshot(entry);
    return true;
  }
  function undo(entry, plan) {
    if (!matches(entry, plan)) return {restored: false, entry};
    const next = {...entry};
    for (const key of fields) {
      if (plan.before[key] === undefined) delete next[key];
      else next[key] = copy(plan.before[key]);
    }
    return {restored: true, entry: Object.keys(next).length ? next : null};
  }
  globalThis.SahneReactionState = {complete, extend, undo};
})();
