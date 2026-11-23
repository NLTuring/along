# Along online integration contract

Implementation contract for the approved Baidu/community/3D/printing upgrade. All paths under `/api`. JSON errors: `{error: {code, message}}`, non-2xx status. Successful JSON is the object below (no extra data envelope). Use credentialed same-origin fetch. Dates are ISO strings; money integer CNY cents. IDs opaque strings. Never trust client owner/email/role/price.

## Runtime/auth
- GET `/config` -> `{mode:'development'|'production',authAvailable:boolean,baidu:{browserKey:string},ai:{available:boolean,provider:string},limits:{imageBytes,videoBytes,videoSeconds}}`; expose no private keys.
- POST `/auth/otp` `{email}` -> `{ok:true,expiresAt:number,code?:string}`; code only explicit development mode. Failure may use `{ok:false,error:'RATE_LIMITED'|'LOCKED'|'MAIL_UNAVAILABLE',until?:number}` for login UI.
- POST `/auth/verify` `{email,code}` -> `{ok:true,user:{id,email,displayName,role},csrfToken:string}`; HttpOnly session cookie. Failure `{ok:false,error:'WRONG'|'EXPIRED'|'LOCKED',triesLeft?,until?}`.
- GET `/auth/session` -> `{user:null|{id,email,displayName,role},csrfToken?:string}`.
- POST `/auth/logout` -> `{ok:true}`. Every authenticated write uses `X-CSRF-Token`; token retrieved via session. Origin checking is also required.
- In production no dev accounts, admin bootstrap or displayed OTP. Admin email allowlist via deployment config only, no public role changes.

## Maps
- POST `/maps/convert` `{lng,lat,from:'WGS84'|'GCJ02'}` -> `{lng,lat,crs:'BD09'}`. Public but exact-Origin protected/rate-limited; fixed Baidu geoconv provider, private BAIDU_SERVER_AK. Missing key returns CONFIG_REQUIRED, never approximated fake conversion. Browser config exposes baidu.browserKey and optional convertAvailable.

## Media
- POST `/media` multipart one `file`; fields `purpose=COMMUNITY|CRAFT`, `consent=true` (private upload is not public publishing). -> `{media:{id,kind:'IMAGE'|'VIDEO',status:'READY'|'PROCESSING'|'FAILED',url,posterUrl?,width?,height?,durationSeconds?}}`.
- GET `/media/:id` -> `{media}` owner/admin or publicly approved post media only.
- GET `/media/:id/file` and `/media/:id/poster`: same access rules, support video range requests; private by default.
- `url` and `posterUrl` are authorized same-origin URLs, not permanent public OSS links. Video processing produces usable MP4 and poster, never marks ready until successful. Validate sniffed bytes, limits, FFmpeg processing deadline.

## Community
Post: `{id,author:{id,displayName},title,body,city,tags:string[],poiId:string|null,media:Media[],status:'DRAFT'|'PENDING'|'PUBLIC'|'REJECTED'|'HIDDEN',createdAt,likeCount,commentCount,liked,saved,reviewNote?}`.
- GET `/posts?city=&q=&tag=&cursor=&mine=1` -> `{items:Post[],nextCursor:string|null}`; public by default, mine requires auth.
- POST `/posts` `{title,body,city,tags,poiId,mediaIds,status:'DRAFT'|'PENDING'}` -> `{post}`; check ownership and media readiness.
- GET `/posts/:id` -> `{post}`; owner may see private, others public only.
- PATCH `/posts/:id` same editable fields; edit public resets review.
- DELETE `/posts/:id` -> `{ok:true}`.
- PUT `/posts/:id/like` `{active:boolean}` -> `{liked,likeCount}`.
- PUT `/posts/:id/save` `{active:boolean}` -> `{saved}`.
- GET `/posts/:id/comments` -> `{items:[{id,author:{id,displayName},body,status,createdAt}]}`; public/own pending only.
- POST `/posts/:id/comments` `{body}` -> `{comment}` pending moderation.
- POST `/reports` `{targetType:'POST'|'COMMENT',targetId,reason}` -> `{ok:true}`.
- GET `/admin/posts?status=PENDING`, `/admin/comments?status=PENDING`, `/admin/reports` -> `{items}`.
- POST `/admin/posts/:id/review` `{status:'PUBLIC'|'REJECTED'|'HIDDEN',note}` -> `{post}`.
- POST `/admin/comments/:id/review` `{status:'PUBLIC'|'REJECTED'|'HIDDEN',note}` -> `{ok:true}`.
- POST `/admin/reports/:id/resolve` `{note}` -> `{ok:true}`.

## AI and model artifacts
- POST `/craft-jobs` `{mediaId,variant:'REAL'|'ANIME',inputVersion:string,idempotencyKey:string,consent:true}` -> `{job}`. Owner image only. REAL requests segmentation; ANIME edits image then segments output. Neither mode may fabricate segmentation or edited image if provider missing.
- GET `/craft-jobs/:id` -> `{job}`. Job `{id,status:'QUEUED'|'PROCESSING'|'READY'|'FAILED'|'CANCELLED',stage,inputVersion,variant,sourceMediaId,outputMedia?:Media,maskMedia?:Media,error?:string}`; mask is aligned single channel/alpha image. Explicitly describe/normalize provider mask representation.
- POST `/craft-jobs/:id/cancel` -> `{job}`; late completion must not change cancelled job.
- POST `/craft-models` multipart: `glb`, `stl`, `metadata` JSON `{localCraftId,inputVersion,variant,product:'MAGNET'|'KEYCHAIN',shape,widthMm,heightMm,baseMm,reliefMm,sourceMediaId?,maskSource:'AI'|'MANUAL'|'NONE',consent:true}` -> `{model:{id,version,glbUrl,stlUrl,metadata}}`. Validate real file headers/mesh bounds and dimensions; reject malformed/oversized artifacts. Immutable owner-only model version, never trust printable flag from client.
- GET `/craft-models/:id` -> `{model}` owner/admin only; file endpoints enforce same authorization.

## Manual production
Inquiry: `{id,modelId,modelVersion,status:'REQUESTED'|'NEEDS_INFO'|'QUOTED'|'CONFIRMED'|'PRODUCING'|'SHIPPED'|'COMPLETED'|'CANCELLED',product,quantity,material,colorProcess,notes,shipping:{name,phone,region,address,postalCode},quote:null|{revision,productionCents,shippingCents,totalCents,leadDays,note},tracking:null|{carrier,number},createdAt,updatedAt}`. Shipping is private, excluded from logs and list summaries where not needed.
- POST `/inquiries` `{modelId,quantity,material,colorProcess,notes,shipping,consent:true,idempotencyKey}` -> `{inquiry}`. Freeze immutable model version; no client prices.
- GET `/inquiries` -> `{items}` current owner.
- GET `/inquiries/:id` -> `{inquiry}` owner or admin.
- PATCH `/inquiries/:id` `{notes?,shipping?}` owner only in REQUESTED/NEEDS_INFO; does not change status/model/quantity/price.
- POST `/inquiries/:id/confirm` `{quoteRevision}` -> `{inquiry}` only latest quote.
- POST `/inquiries/:id/cancel` `{reason}` -> `{inquiry}` only before production; after requires manual support and returns CONFLICT.
- GET `/admin/inquiries` -> `{items}`.
- POST `/admin/inquiries/:id/quote` `{productionCents,shippingCents,leadDays,note}` -> `{inquiry}`.
- POST `/admin/inquiries/:id/status` `{status,note?,carrier?,number?}` -> `{inquiry}` with strict transition rules; shipping requires carrier and number.

## Client seams / file ownership
- Main agent owns shared `app.js/router.js/auth.js/login.js/i18n.js/index.html`, package.json, api.js, maps and all root build/deploy integration. Frontend API helper: `api(path, options={method,body,signal})`, `upload(path,formData,{onProgress,signal}={})`, `getRuntimeConfig()`, `initApi()`; `api` path is WITHOUT `/api` prefix and auto serializes plain body, includes credentials/CSRF; errors throw with `.code`, `.status`, `.message`.
- Community agent owns community pages/composer/service, print inquiry pages, admin UI, community translation files, corresponding tests. It uses async backend routes above and existing auth facade; do NOT change main-owned files. `renderPost(root,id)`, `renderMakeOrder(root,modelId)`, `renderMakeOrders(root,id?)` are new exports to register.
- Craft agent owns craft-model.js/crafts.js/page-craft.js/page-crafts.js, geometry/hold/export modules, tests, craft-online translation files, vendor build script. `createCraftModel` may change async boundaries as needed but preserve lifecycle. On uploaded model success `go('make-order/'+model.id)`.
- Backend agent owns server/ and its manifests/config/tests, does not edit other directories. Tell main if extra routes or differences are needed.
- New feature translations: `mobile/assets/messages/community.en.json`, `.zh.json`, `craft-online.en.json`, `.zh.json`; main merges these in i18n/check. Do not edit base en.json/zh.json concurrently.
- All files and service integrations must fail honestly without credentials. No real photos sent to outside services during development validation. Local tests use synthetic fixtures.
