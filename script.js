const loader = document.querySelector('.loader');

// Theme toggle with a saved preference.
const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle?.querySelector('.theme-toggle-icon');
const themeColorMeta = document.getElementById('theme-color');
const THEME_STORAGE_KEY = 'vijaa-theme';

function applyTheme(theme, savePreference = true) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';

  if (themeIcon) themeIcon.textContent = isDark ? '☀' : '☾';
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', String(isDark));
    const label = isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap';
    themeToggle.setAttribute('aria-label', label);
    themeToggle.title = label;
  }
  if (themeColorMeta) themeColorMeta.setAttribute('content', isDark ? '#151116' : '#f7c4d8');

  if (savePreference) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch (error) {
      console.warn('Preferensi tema tidak bisa disimpan di browser ini.', error);
    }
  }
}

const initialTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
applyTheme(initialTheme, false);

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});


window.addEventListener('load', () => {
  window.setTimeout(() => loader?.classList.add('done'), 1000);
});

const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');

function closeMenu() {
  mainNav?.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Buka navigasi');
}

menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav?.classList.toggle('open') ?? false;
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Tutup navigasi' : 'Buka navigasi');
});

mainNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeMenu);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const revealElements = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add('is-visible'));
}

// Photo uploads are stored in IndexedDB so the gallery remains after refresh.
const DB_NAME = 'vijaaPortfolioDB';
const DB_VERSION = 1;
const STORE_NAME = 'photographs';
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('gallery-empty');
const uploadInput = document.getElementById('photo-upload');
const galleryNote = document.getElementById('gallery-note');

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Browser ini belum mendukung penyimpanan galeri.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withPhotoStore(mode, callback) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = callback(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(result?.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function updateEmptyState() {
  if (!gallery || !emptyState) return;
  const hasPhotos = gallery.querySelector('.gallery-item') !== null;
  emptyState.hidden = hasPhotos;
}

function createGalleryCard(photo) {
  const card = document.createElement('figure');
  card.className = 'gallery-item';

  const image = document.createElement('img');
  image.src = photo.dataUrl;
  image.alt = photo.name ? `Foto: ${photo.name}` : 'Hasil fotografi Viana Julita';
  image.loading = 'lazy';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = '×';
  removeButton.setAttribute('aria-label', `Hapus ${photo.name || 'foto'}`);
  removeButton.addEventListener('click', async () => {
    try {
      await withPhotoStore('readwrite', (store) => store.delete(photo.id));
      card.remove();
      updateEmptyState();
    } catch (error) {
      alert('Foto belum bisa dihapus. Coba refresh halaman.');
      console.error(error);
    }
  });

  card.append(image, removeButton);
  return card;
}

async function loadPhotos() {
  if (!gallery) return;

  try {
    const db = await openPhotoDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      request.result
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach((photo) => gallery.appendChild(createGalleryCard(photo)));
      updateEmptyState();
      db.close();
    };

    request.onerror = () => {
      db.close();
      console.error(request.error);
    };
  } catch (error) {
    console.error(error);
    if (galleryNote) {
      galleryNote.textContent = 'Penyimpanan galeri tidak tersedia di browser ini. Kamu tetap bisa menambahkan foto manual lewat folder website.';
    }
  }
}

uploadInput?.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
  if (!files.length || !gallery) return;

  let db;
  try {
    db = await openPhotoDB();

    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const photo = {
        id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        name: file.name,
        dataUrl,
        createdAt: Date.now()
      };

      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(photo);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });

      gallery.appendChild(createGalleryCard(photo));
    }

    updateEmptyState();
  } catch (error) {
    console.error(error);
    alert('Foto gagal disimpan. Coba gunakan gambar dengan ukuran file lebih kecil.');
  } finally {
    db?.close();
    uploadInput.value = '';
  }
});

loadPhotos();
