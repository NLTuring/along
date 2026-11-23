// Online composer: files stay in-browser until explicit private-upload consent.
import { t, te, esc } from './i18n.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { getSession } from './auth.js';
import { api, getRuntimeConfig } from './api.js';
import { go } from './router.js';
import { POST_LIMITS, validatePost, moveItem, mediaFileError, uploadCommunityFile, pathId, safeMediaUrl } from './community.js';
import { errorText, needLogin, sheetScope, notifyPosts, stopMedia } from './community-ui.js';

// `draft` starts a new story from something already on the phone (a film's photos, a caption).
// Its files are still uploaded only after the traveller ticks the upload consent and taps Upload.
export function openPostComposer({ post = null, draft = null } = {}) {
  if (!needLogin(() => openPostComposer({ post, draft }))) return;
  if (post && post.author?.id !== getSession()?.id) return;
  openSheet({ title: te(post ? 'community.edit' : 'community.compose'), body: `<form class="community-form" data-compose-form novalidate>
    <label class="field"><span>${te('community.postTitle')}</span><input class="input" name="title" maxlength="120" required value="${esc(post?.title || draft?.title || '')}" data-autofocus></label>
    <label class="field"><span>${te('community.body')}</span><textarea class="input input--area" name="body" rows="5" maxlength="10000" required>${esc(post?.body || draft?.body || '')}</textarea></label>
    <div class="field-row"><label class="field"><span>${te('community.city')}</span><input class="input" name="city" required maxlength="100" value="${esc(post?.city || draft?.city || '')}"></label><label class="field"><span>${te('community.tags')}</span><input class="input" name="tags" maxlength="329" value="${esc(post?.tags?.join(', ') || draft?.tags?.join(', ') || '')}" placeholder="${te('community.tagsHint')}"></label></div>
    <label class="field"><span>${te('community.poiId')}</span><input class="input" name="poiId" maxlength="200" value="${esc(post?.poiId || '')}" placeholder="${te('community.poiHint')}"></label>
    <fieldset class="field-group"><legend>${te('community.attachments')}</legend><p class="t-small">${te('community.mediaHint', { n: POST_LIMITS.media, seconds: getRuntimeConfig().limits?.videoSeconds || 60 })}</p><input class="input" type="file" name="files" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple aria-label="${te('community.chooseFiles')}"><ol class="community-upload-list" data-files></ol><label class="community-check"><input type="checkbox" name="uploadConsent"><span>${te('community.uploadConsent')}</span></label><button class="btn btn--secondary" type="button" data-upload>${te('community.upload')}</button><p class="t-small" role="status" data-upload-status></p></fieldset>
    <p class="note">${te(post?.status === 'PUBLIC' ? 'community.editReviewNote' : 'community.publishNote')}</p><label class="community-check"><input type="checkbox" name="publishConsent"><span>${te('community.publishConsent')}</span></label><p class="field-error" role="alert" data-error></p><div class="community-actions"><button class="btn btn--secondary" type="submit" name="action" value="DRAFT">${te('community.saveDraft')}</button><button class="btn btn--primary" type="submit" name="action" value="PENDING">${te('community.submitReview')}</button></div></form>`, onMount(panel) {
      const form = panel.querySelector('form'), list = panel.querySelector('[data-files]'), error = panel.querySelector('[data-error]'), uploadButton = panel.querySelector('[data-upload]');
      let files = (post?.media || []).map(media => ({ key: crypto.randomUUID(), media, status: media.status, url: safeMediaUrl(media.kind === 'VIDEO' ? media.posterUrl : media.url), file: null, progress: 100, controller: null }));
      for (const file of (draft?.files || []).slice(0, POST_LIMITS.media)) {
        if (!mediaFileError(file, getRuntimeConfig().limits)) files.push({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file), media: null, status: 'LOCAL', progress: 0, controller: null });
      }
      let saving = false, uploading = false;
      const scope = sheetScope(panel, () => files.forEach(item => { item.controller?.abort(); if (item.file && item.url) URL.revokeObjectURL(item.url); }));
      function paintFiles() {
        if (!scope.alive()) return;
        stopMedia(list);
        list.innerHTML = files.map((item, index) => `<li class="community-upload" data-file="${esc(item.key)}">${item.url ? item.file?.type.startsWith('video/') ? `<video src="${esc(item.url)}" class="community-upload__thumb" controls muted playsinline preload="metadata" aria-label="${te('community.video')}"></video>` : `<img src="${esc(item.url)}" class="community-upload__thumb" alt="">` : ''}<div class="community-upload__info"><strong>${esc(item.file?.name || t(item.media?.kind === 'VIDEO' ? 'community.video' : 'community.photo'))}</strong><span class="t-small" role="status">${te(`community.uploadState.${item.status}`)}${item.status === 'UPLOADING' ? ` ${item.progress}%` : ''}</span>${item.error ? `<span class="field-error">${esc(item.error)}</span>` : ''}<div class="community-upload__actions"><button type="button" class="btn btn--text" data-move="-1" ${index === 0 || saving ? 'disabled' : ''} aria-label="${te('community.moveEarlier')}">${te('community.earlier')}</button><button type="button" class="btn btn--text" data-move="1" ${index === files.length - 1 || saving ? 'disabled' : ''} aria-label="${te('community.moveLater')}">${te('community.later')}</button><button type="button" class="btn btn--text" data-remove ${saving ? 'disabled' : ''}>${te(['UPLOADING', 'PROCESSING'].includes(item.status) ? 'community.cancelUpload' : 'community.remove')}</button></div></div></li>`).join('');
        uploadButton.disabled = saving || uploading || !files.some(item => item.file && item.status !== 'READY');
      }
      form.elements.files.addEventListener('change', () => {
        error.textContent = '';
        for (const file of form.elements.files.files) {
          if (files.length >= POST_LIMITS.media) { error.textContent = t('community.error.mediaCount'); break; }
          const problem = mediaFileError(file, getRuntimeConfig().limits);
          if (problem) { error.textContent = t(`community.error.${problem}`); continue; }
          files.push({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file), media: null, status: 'LOCAL', progress: 0, controller: null });
        }
        form.elements.files.value = ''; paintFiles();
      });
      list.addEventListener('click', event => {
        if (saving) return;
        const row = event.target.closest('[data-file]'); if (!row) return;
        const index = files.findIndex(item => item.key === row.dataset.file); if (index < 0) return;
        const item = files[index];
        if (event.target.closest('[data-remove]')) {
          item.controller?.abort(); if (item.file) URL.revokeObjectURL(item.url); files.splice(index, 1); paintFiles();
        } else { const move = event.target.closest('[data-move]'); if (move) { files = moveItem(files, index, index + Number(move.dataset.move)); paintFiles(); } }
      });
      uploadButton.addEventListener('click', async () => {
        if (uploading || saving) return;
        if (!form.elements.uploadConsent.checked) { error.textContent = t('community.error.uploadConsent'); form.elements.uploadConsent.focus(); return; }
        uploading = true; error.textContent = ''; uploadButton.disabled = true;
        const candidates = files.filter(item => item.file && item.status !== 'READY');
        for (const item of candidates) {
          if (!scope.alive()) break;
          if (!files.includes(item)) continue;
          item.controller = new AbortController();
          const abort = () => item.controller.abort(); scope.signal.addEventListener('abort', abort, { once: true });
          item.status = 'UPLOADING'; item.progress = 0; item.error = ''; paintFiles();
          try {
            item.media = await uploadCommunityFile(item.file, {
              consent: form.elements.uploadConsent.checked, signal: item.controller.signal,
              onProgress: progress => { item.progress = progress; if (scope.alive() && files.includes(item)) { const text = list.querySelector(`[data-file="${item.key}"] [role="status"]`); if (text) text.textContent = `${t('community.uploadState.UPLOADING')} ${progress}%`; } },
              onState: media => { item.media = media; item.status = media.status; paintFiles(); },
            });
            item.status = 'READY';
          } catch (problem) { item.status = 'FAILED'; item.error = errorText(problem); }
          finally { scope.signal.removeEventListener('abort', abort); item.controller = null; }
          paintFiles();
        }
        uploading = false;
        if (scope.alive()) { panel.querySelector('[data-upload-status]').textContent = files.length && files.every(item => item.status === 'READY') ? t('community.uploadReady') : t('community.uploadCheck'); paintFiles(); }
      });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (saving || uploading) return;
        error.textContent = '';
        const state = event.submitter?.value || 'DRAFT';
        if (files.some(item => item.status !== 'READY' || !item.media?.id)) { error.textContent = t('community.error.mediaReady'); return; }
        if (state === 'PENDING' && !form.elements.publishConsent.checked) { error.textContent = t('community.error.publishConsent'); form.elements.publishConsent.focus(); return; }
        const checked = validatePost({ title: form.elements.title.value, body: form.elements.body.value, city: form.elements.city.value, tags: form.elements.tags.value, poiId: form.elements.poiId.value, mediaIds: files.map(item => item.media.id), status: state });
        if (!checked.ok) { error.textContent = t(`community.error.${checked.errors[0]}`); form.elements[checked.errors[0]]?.focus(); return; }
        saving = true; form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
        try {
          const result = await api(post ? `/posts/${pathId(post.id)}` : '/posts', { method: post ? 'PATCH' : 'POST', body: checked.value, signal: scope.signal });
          if (!scope.alive()) return;
          // A new story lands on the author's profile, where it now lives; an edit returns to the story.
          scope.dispose(); closeSheet(); notifyPosts(); toast(t(state === 'DRAFT' ? 'community.draftSaved' : 'community.submitted')); go(post ? `posts/${pathId(result.post.id)}` : `u/${pathId(result.post.author.id)}`);
        } catch (problem) { if (scope.alive()) error.textContent = errorText(problem); }
        finally { saving = false; if (scope.alive()) { form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = false; }); paintFiles(); } }
      });
      paintFiles();
    } });
}
