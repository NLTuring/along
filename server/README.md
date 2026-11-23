# Server AI providers

## Configuration and readiness

Copy `.env.example` to `.env` and fill the required database, Redis, private S3, session and (in production) SMTP settings. The example has no credentials and is deliberately not runnable as production configuration. `npm run dev:local` is the separate credential-free local mode; it never calls external AI. Run schema migration before starting a non-local API and worker.

AI defaults to **disabled**. `/api/config` publishes only `{ available, provider }`, not keys, endpoints, allowlists or prompts. `available` means the **entire chain is configured**, not that a provider has passed a live health check or guaranteed image quality. It stays false unless editing, its key/allowlist, and a separately configured anime-capable segmentation service are all present. No substitute anime image or fake mask is generated on missing configuration or failures. Both REAL and ANIME job entrypoints are gated by this complete-chain readiness flag.

The server preserves `provider.edit(imageBytes)` and `provider.segment(imageBytes)`. ANIME jobs edit first, normalize the returned image, then request a mask matching that output; REAL jobs only segment the original normalized image.

## Official Aliyun DashScope editing

Set `AI_PROVIDER=aliyun-dashscope` and configure:

- `DASHSCOPE_API_KEY`: server-only Model Studio API key, appropriate for the region/account. This is not an AccessKey ID/secret or a browser credential.
- `DASHSCOPE_REGION`: `cn-beijing` or `ap-southeast-1`. Default is Beijing; no automatic cross-region failover.
- `DASHSCOPE_MODEL`: **required, no default**. Choose a documented synchronous Qwen image-edit model enabled for your account/region. The current official reference documents `qwen-image-2.0-pro` and `qwen-image-2.0`; model access and pricing must be confirmed with Aliyun. Other `qwen-image-*` identifiers are configurable but are not thereby verified or guaranteed compatible.
- `DASHSCOPE_ENDPOINT`: optional full endpoint. Defaults to `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` (Beijing) or the same path on `dashscope-intl.aliyuncs.com` (Singapore), documented legacy hosts. Workspace endpoints on `<WorkspaceId>.cn-beijing.maas.aliyuncs.com` or `<WorkspaceId>.ap-southeast-1.maas.aliyuncs.com` are supported for the matching region and exact same API path.
- `DASHSCOPE_ENDPOINT_HOSTS`: exact comma-separated hostname allowlist. Default is the selected region's legacy host; a workspace endpoint requires explicitly listing its exact hostname. Arbitrary hosts, cross-region hosts, alternate API paths, queries and credential-bearing URLs are rejected in official mode.
- `DASHSCOPE_RESULT_HOSTS`: **required** exact result-download hostname allowlist. Confirm the actual storage hosts from Aliyun's documentation/deployment. Documented examples include `dashscope-result-bj.oss-cn-beijing.aliyuncs.com`, `dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com` and `dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com`; these are examples, not an exhaustive stable list. Only add the specific needed trusted hosts; do not allow all of `aliyuncs.com`. Unknown result hosts fail closed and require operator review, not automatic allowlisting.
- `DASHSCOPE_EDIT_PROMPT`: optional server-owned editing instruction; defaults to an anime conversion instruction preserving people, pose, silhouette and composition. This is an instruction, not a guarantee the model preserves geometry or identity.

The implementation calls the **native synchronous JSON API**, not the binary gateway protocol:

```json
{
  "model": "<configured-model>",
  "input": {
    "messages": [{
      "role": "user",
      "content": [
        { "image": "data:image/png;base64,<sanitized-png>" },
        { "text": "<server-owned-instruction>" }
      ]
    }]
  },
  "parameters": { "n": 1 }
}
```

It authenticates using `Authorization: Bearer <DASHSCOPE_API_KEY>`. Source images are decoded, oriented and re-encoded without original metadata before Base64 encoding; only supported single-frame raster formats are accepted. Sanitized input is limited to 10,000,000 bytes (conservatively below the documented 10 MB maximum). The response must have one completed assistant choice and exactly one `output.choices[0].message.content[*].image` URL. Error JSON, malformed/oversized responses, incomplete choices and ambiguous outputs are rejected. No async task endpoint/polling or OpenAI-compatible API is assumed.

The result image is downloaded using the explicit host allowlist, **without forwarding the API key**, checked as PNG, decoded and sanitized before returning to the existing job pipeline. Signed URLs and provider error bodies are not exposed to clients. `AI_REQUEST_TIMEOUT_MS` defaults to 120,000 ms and is constrained to 1,000–180,000 ms; editing's API request and download share that overall deadline, and each download is additionally capped at 30 seconds. Slow generations fail rather than pretend to succeed. Provider JSON is capped at 64 KiB; result/mask bytes at the existing 12 MiB image limit; image decoding keeps the 25-million-pixel bound.

## Segmentation is an explicit deployment prerequisite

**Official SegmentBody is not an anime segmentation API.** Its [official reference](https://help.aliyun.com/zh/viapi/developer-reference/api-q897dp) describes real-person images only, at most 3 MB and dimensions below 2000×2000, using `ImageURL` and `ReturnForm` for masks. This integration does not implement that API or claim it works on anime. Pointing `AI_SEGMENT_URL` at it will not work: the gateway protocol below is different.

Provision a trusted general segmentation service verified for **both real people and anime characters**, then set:

- `AI_SEGMENT_URL`: fixed HTTPS endpoint, configured by the operator, never the request body.
- `AI_SEGMENT_ALLOWED_HOSTS`: exact endpoint hostname(s), no wildcards/ports/URL strings.
- `AI_SEGMENT_API_KEY`: a separate gateway secret. The DashScope key is never reused for this service.
- `AI_SEGMENT_ANIME_CAPABLE=true`: an explicit operator assertion only after validating the service. It is not an automatic capability detector or an implementation of segmentation.
- `AI_MASK_REPRESENTATION`: `grayscale-white-foreground` (default) or `alpha-foreground`.

Gateway contract: `POST` sanitized `image/png` bytes with its own Bearer key; HTTP 200 `image/png` binary response, **not JSON or an output URL**. The mask must exactly match the input dimensions and contain both foreground and background. Grayscale means equal RGB channels with white=subject, black=background; alpha mode uses foreground opacity. Colored person cut-outs are rejected in grayscale mode. Existing mask normalization outputs a grayscale white-foreground PNG; there is no guessed background removal, resizing, inverse-mask inference or synthetic fallback.

## Explicit generic gateway alternative

`AI_PROVIDER=http-gateway` retains the binary PNG editing protocol (it is **not official Aliyun**). Set `AI_EDIT_URL`, `AI_EDIT_ALLOWED_HOSTS`, `AI_API_KEY` plus all the segmentation settings above. Editing returns an edited PNG via HTTP 200. Old `AI_PROVIDER_NAME` is no longer a provider selector; legacy URL/key settings alone do not enable AI. `AI_SEGMENT_API_KEY` must be configured separately even if an operator deliberately uses the same underlying service credential.

## Network safety and validation

All calls use HTTPS port 443, reject credentials/fragments and redirects, resolve all DNS answers, reject private/loopback/link-local/reserved addresses, and pin a validated public IP while retaining the hostname for TLS verification. DNS resolution, TLS and response reads are covered by deadlines. Declared and streamed response lengths are bounded; compressed bodies and prematurely ended responses are rejected. Result-host allowlisting is exact, not suffix matching. Restrict deployment egress as additional defense.

`server/test/provider.test.ts` uses synthetic in-memory image fixtures and mocked transport/DNS/HTTPS only. No real person photo, real provider request, fabricated production anime image or fabricated production mask is used. Typecheck with `npm run typecheck`; run tests with `npm test` from the server directory. Live account availability, real output quality, regional result hosts and the external segmentation service remain deployment acceptance checks requiring credentials and consent.

References checked for the implemented JSON shape and documented limits: [Qwen image editing API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api), [English API reference](https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-api), and [SegmentBody](https://help.aliyun.com/zh/viapi/developer-reference/api-q897dp). No live paid API validation was performed.
