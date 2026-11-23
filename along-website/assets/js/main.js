// Main entry point for Along website
import { initI18n, setLocale, getLocale, t } from './i18n.js';
import { initSky, updateSkyGradient } from './sky.js';
import { setupLogoReveal } from './logo-animation.js';
import { initWindowCarousel } from './window-carousel.js';
import { initKeepsakePreview } from './keepsake-preview.js';

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize i18n
  initI18n();
  
  // Initialize sky gradient
  const skyEl = document.getElementById('sky');
  const skyState = initSky(skyEl);
  updateSkyGradient(skyEl);
  
  // Set up opening shade animation
  const shade = document.getElementById('shade');
  const main = document.getElementById('main');
  const shadePrompt = document.getElementById('shadePrompt');
  
  // Set initial prompt text
  shadePrompt.textContent = t('welcome.pull');
  
  // Logo drawing animation
  setTimeout(() => {
    setupLogoReveal(document.getElementById('logoCanvas'));
  }, 300);
  
  // Open shade after logo finishes drawing
  setTimeout(() => {
    shade.classList.add('is-opening');
    setTimeout(() => {
      main.classList.add('is-visible');
      shade.style.display = 'none';
    }, 1200);
  }, 2800);
  
  // Initialize window carousel
  const windowContainer = document.getElementById('windowPorthole');
  const windowImage = document.getElementById('windowImage');
  const windowCaption = document.getElementById('windowCaption');
  
  initWindowCarousel(windowContainer, windowImage, windowCaption, getLocale());
  
  // Initialize keepsake 3D preview
  const keepsakeCanvas = document.getElementById('keepsakeCanvas');
  if (keepsakeCanvas) {
    try {
      await initKeepsakePreview(keepsakeCanvas);
    } catch (error) {
      console.warn('Keepsake preview failed:', error);
    }
  }
  
  // Language switch
  const langSwitch = document.getElementById('langSwitch');
  const updateLangUI = () => {
    const locale = getLocale();
    document.querySelectorAll('[data-lang]').forEach(el => {
      el.classList.toggle('active', el.dataset.lang === locale);
    });
    // Update all translatable text
    shadePrompt.textContent = t('welcome.pull');
  };
  
  langSwitch.addEventListener('click', (e) => {
    const target = e.target.closest('[data-lang]');
    if (target) {
      const newLocale = target.dataset.lang;
      setLocale(newLocale);
      updateLangUI();
      
      // Restart window carousel with new locale
      initWindowCarousel(windowContainer, windowImage, windowCaption, newLocale);
    }
  });
  
  updateLangUI();
  
  // Archive entrance button
  const enterArchive = document.getElementById('enterArchive');
  if (enterArchive) {
    enterArchive.addEventListener('click', () => {
      window.location.href = '/archive.html';
    });
  }
  
  // Update sky gradient angle based on scroll
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
        const angle = 180 + scrollPercent * 20;
        updateSkyGradient(skyEl, angle);
        ticking = false;
      });
      ticking = true;
    }
  });
});
