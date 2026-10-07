import { z } from 'zod';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const showIdSchema = z.number().int().positive().max(2147483647);
export const ratingSchema = z.number().min(1).max(10).refine(value => Number.isInteger(value * 2), 'Puan yarım adımlarla verilmeli.');
const safeImage = value => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/^\/(?!\/)[a-zA-Z0-9_./%~-]+$/.test(value) && !value.includes('..')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
export const imageSchema = z.string().refine(safeImage, 'Geçerli bir HTTPS görseli veya yerel dosya yolu seç.').nullable();
const safeAvatar = value => {
  if (safeImage(value)) return true;
  if (typeof value !== 'string' || value.length > 350000) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 250000 || bytes.length < 12 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (match[1] === 'jpeg') return bytes[0]===255 && bytes[1]===216 && bytes[2]===255 && bytes.at(-2)===255 && bytes.at(-1)===217;
  return bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' && bytes.readUInt32LE(4)===bytes.length-8;
};
export const avatarSchema = z.string().refine(safeAvatar,'PNG, JPEG veya WebP görseli seç (en fazla 250 KB).').nullable();
export const showSchema = z.object({
  id: showIdSchema,
  name: z.string().trim().min(1).max(180),
  image: imageSchema.optional().default(null),
  hero: imageSchema.optional().default(null),
  genres: z.array(z.string().trim().min(1).max(50)).max(12).optional().default([]),
  year: z.number().int().min(1900).max(2100).nullable().optional().default(null),
}).strict();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Geçerli bir tarih seç.');
const idKey = z.string().regex(/^[1-9]\d{0,9}$/).refine(value => Number(value) <= 2147483647);
const listId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const libraryEntrySchema = z.object({
  status: z.enum(['planned','watching','done','paused','dropped']).optional(),
  review: z.string().trim().max(5000).optional(),
  date: dateSchema.optional(),
  rating: ratingSchema.optional(),
  favorite: z.boolean().optional(),
  lists: z.array(listId).max(30).optional(),
  episodes: z.array(showIdSchema).max(5000).optional(),
  spoiler: z.boolean().optional(),
}).strict();
export const librarySnapshotSchema = z.object({
  entries: z.record(idKey, libraryEntrySchema).refine(value => Object.keys(value).length <= 3000),
  lists: z.array(z.object({id:listId,name:z.string().trim().min(1).max(100),description:z.string().trim().max(500).optional().default('')}).strict()).max(30),
  ratings: z.record(idKey, z.enum(['dislike','like','love'])).refine(value => Object.keys(value).length <= 3000),
  shows: z.array(showSchema).max(6000),
  version: z.number().int().nonnegative().max(2147483646),
}).strict();
const showFields = {showId: showIdSchema, show: showSchema.optional()};
const body = z.string().trim().min(1).max(5000);
const spoiler = z.boolean().optional().default(false);
const uuid = z.uuid();
const schemas = {
  updateProfile: z.object({name:z.string().trim().min(1).max(100).optional(),bio:z.string().trim().max(500).optional(),image:avatarSchema.optional()}).strict(),
  follow: z.object({username:z.string().min(3).max(30),following:z.boolean()}).strict(),
  log: z.object({...showFields,watchedAt:dateSchema.optional(),body:z.string().trim().max(5000).optional().default(''),spoiler,rating:ratingSchema.optional()}).strict(),
  librarySync: librarySnapshotSchema,
  createTopic: z.object({showId:showIdSchema.optional(),show:showSchema.optional(),title:z.string().trim().min(3).max(180),body,spoiler,category:z.enum(['general','theory','recommendation','question']).optional().default('general')}).strict(),
  reply: z.object({topicId:uuid,body,spoiler}).strict(),
  comment: z.object({...showFields,body,spoiler}).strict(),
  rate: z.object({...showFields,rating:ratingSchema.nullable()}).strict(),
  like: z.object({postId:uuid,liked:z.boolean()}).strict(),
  report: z.object({postId:uuid,reason:z.string().trim().min(3).max(500)}).strict(),
  deleteOwn: z.object({postId:uuid}).strict(),
  readNotifications: z.object({}).strict(),
};
export function parseMutation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400,'INVALID_INPUT','İstek geçerli bir nesne olmalı.');
  const {action:rawAction,...payload} = input;
  const action = ({profile:'updateProfile',topic:'createTopic'})[rawAction] || rawAction;
  if (!Object.hasOwn(schemas,action)) throw new ApiError(400,'INVALID_ACTION','Bu işlem tanınmıyor.');
  const parsed = schemas[action].safeParse(payload);
  if (!parsed.success) throw new ApiError(400,'INVALID_INPUT','Alanları ve puan aralığını kontrol et.');
  if (parsed.data.show && parsed.data.show.id !== parsed.data.showId) throw new ApiError(400,'SHOW_MISMATCH','Dizi kimliği eşleşmiyor.');
  return {action,data:parsed.data};
}
export function pageOptions(params) {
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400,'INVALID_INPUT','Sayfa boyutu 1–50 arasında olmalı.');
  const raw = params.get('cursor');
  if (!raw) return {limit,cursor:null};
  if (raw.length > 256) throw new ApiError(400,'INVALID_CURSOR','Sayfa işareti geçersiz.');
  try {
    const cursor = JSON.parse(Buffer.from(raw,'base64url').toString());
    if (typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at)) || !z.uuid().safeParse(cursor.id).success) throw new Error();
    return {limit,cursor};
  } catch { throw new ApiError(400,'INVALID_CURSOR','Sayfa işareti geçersiz.'); }
}
export function numericShowId(raw) {
  const parsed = showIdSchema.safeParse(Number(raw));
  if (!parsed.success) throw new ApiError(400,'INVALID_INPUT','Dizi kimliği geçersiz.');
  return parsed.data;
}
