// Keep data saved by older deployments working after asset filenames change.
const STATIC_IMAGE_MIGRATIONS = {
  '/public/images/products/10.00 SAR.jpg': '/public/images/products/1.jpg',
  '/public/images/products/10.00 SAR-2.jpg': '/public/images/products/1.jpg',
  '/public/images/products/10 SAR Hifi LED.jpg': '/public/images/products/2.jpg',
  '/public/images/products/40W - 8.30 SAR.jpg': '/public/images/products/3.png',
  '/public/images/products/14.00 SAR .jpg': '/public/images/products/4.png',
  '/public/images/products/0Y - 35.00 SAR.jpg': '/public/images/products/5.png',
  '/public/images/products/7 - 2.20 SAR .jpg': '/public/images/products/6.jpg',
  '/public/images/products/E27 - 2.20 SAR .jpg': '/public/images/products/7.jpg',
  '/public/images/products/W - 15.00 SAR .jpg': '/public/images/products/8.jpg',
  '/public/images/products/0W - 15.00 SAR.jpg': '/public/images/products/9.jpg',
  '/public/images/products/put - 3.50 SAR .jpg': '/public/images/products/10.jpg',
  '/public/images/products/put - 6.00 SAR .jpg': '/public/images/products/11.jpg',
  '/public/images/products/led-multi.jpg': '/public/images/products/12.jpg',
  '/public/images/blog/solar-tech.jpg': '/public/images/products/30.jpg',
  '/public/images/blog/circuit-breaker.jpg': '/public/images/products/31.jpg',
  '/public/images/hero-bg-1.jpg': '/public/images/products/27.jpg',
  '/public/images/hero-bg-2.jpg': '/public/images/products/28.jpg',
  '/public/images/hero-bg-3.jpg': '/public/images/products/29.jpg'
};

function migrateStaticImage(path) {
  return STATIC_IMAGE_MIGRATIONS[path] || path;
}

// ================================================================
// main.js – النواة الأسطورية لمتجر النخبة
// الإصدار النهائي المتكامل (Firebase + ImgBB + 3D Engine)
// ================================================================

import * as THREE from 'three';

// ================================================================
// إعدادات Firebase السحابية
// ================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAnkES6TCMGdshbJmocM_0avknOcdbJ4Ms",
  authDomain: "nokhba-store.firebaseapp.com",
  projectId: "nokhba-store",
  storageBucket: "nokhba-store.firebasestorage.app",
  messagingSenderId: "701367541618",
  appId: "1:701367541618:web:d2f0663718a30cc8f9c7eb",
  measurementId: "G-F0MJ55GPMW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================================================================
// 1. STORAGE ADAPTERS – طبقة تجريد التخزين
// ================================================================

export class StorageAdapter {
  async get(key) { throw new Error('Not implemented'); }
  async set(key, value) { throw new Error('Not implemented'); }
  async remove(key) { throw new Error('Not implemented'); }
  async clear() { throw new Error('Not implemented'); }
}

export class LocalStorageAdapter extends StorageAdapter {
  async get(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }
  async set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  async remove(key) {
    localStorage.removeItem(key);
  }
  async clear() {
    localStorage.clear();
  }
}

export class FirebaseAdapter extends StorageAdapter {
  async get(key) {
    try {
      const docRef = doc(db, "nokhba_db", key); 
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data().value;
      } else {
        return null;
      }
    } catch (e) {
      console.error("خطأ في جلب البيانات من فايربيس:", e);
      return null;
    }
  }

  async set(key, value) {
    try {
      const docRef = doc(db, "nokhba_db", key);
      await setDoc(docRef, { value: value }); 
    } catch (e) {
      console.error("خطأ في حفظ البيانات في فايربيس:", e);
    }
  }

  async remove(key) {
    try {
      const docRef = doc(db, "nokhba_db", key);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("خطأ في الحذف:", e);
    }
  }

  async clear() {
    console.warn("تم إيقاف مسح قاعدة البيانات بالكامل للحماية");
  }
}

// ================================================================
// 2. CATEGORY MANAGER
// ================================================================

export class CategoryManager {
  #adapter;
  #cache = null;

  constructor(adapter = new FirebaseAdapter()) {
    this.#adapter = adapter;
  }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_categories');
    this.#cache = (data && Array.isArray(data)) ? data : [];
    return this.#cache;
  }

  async getAll() {
    return this.#load();
  }

  async add(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('اسم الفئة مطلوب');
    const list = await this.#load();
    if (list.includes(trimmed)) throw new Error('الفئة موجودة بالفعل');
    list.push(trimmed);
    await this.#adapter.set('nokhba_categories', list);
    this.#cache = null;
    return list;
  }

  async remove(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('اسم الفئة مطلوب');
    let list = await this.#load();
    if (!list.includes(trimmed)) throw new Error('الفئة غير موجودة');
    list = list.filter(c => c !== trimmed);
    await this.#adapter.set('nokhba_categories', list);
    this.#cache = null;
    const productManager = new ProductManager();
    const products = await productManager.getAll(true);
    for (const p of products) {
      if (p.category === trimmed) {
        p.category = '';
        await productManager.mutate({ type: 'UPDATE', payload: p });
      }
    }
    return list;
  }

  async reset() {
    await this.#adapter.set('nokhba_categories', []);
    this.#cache = null;
    return [];
  }
}

// ================================================================
// 3. PRODUCT MANAGER
// ================================================================

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = matrix[0];
    matrix[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const temp = matrix[i];
      matrix[i] = Math.min(
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
        matrix[i] + 1,
        matrix[i - 1] + 1
      );
      prev = temp;
    }
  }
  return matrix[a.length];
}

export class ProductManager {
  #adapter;
  #cache = null;

  constructor(adapter = new FirebaseAdapter()) {
    this.#adapter = adapter;
  }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_products');
    const defaults = [
      {
        id: 'p1',
        name: 'مفتاح تيار 32A',
        category: 'مفاتيح',
        price: 45,
        stock: 100,
        minOrder: 1,
        rating: 4.5,
        isNew: true,
        isBestSeller: false,
        active: true,
        sortOrder: 1,
        image: '/public/images/products/1.jpg',
        images: ['/public/images/products/1.jpg'],
        desc: 'مفتاح تيار عالي الجودة 32 أمبير، مثالي للاستخدام المنزلي والصناعي.',
        variants: []
      }
    ];
    const parsed = data && data.length ? data : defaults;
    parsed.forEach(p => {
      p.image = migrateStaticImage(p.image);
      if (Array.isArray(p.images)) p.images = p.images.map(migrateStaticImage);
      p.price = parseFloat(p.price) || 0;
      p.stock = parseFloat(p.stock) || 0;
      p.minOrder = parseFloat(p.minOrder) || 1;
      p.rating = parseFloat(p.rating) || 0;
      p.sortOrder = parseFloat(p.sortOrder) || 0;
      if (p.variants) {
        p.variants.forEach(v => {
          v.price = parseFloat(v.price) || 0;
          v.stock = parseFloat(v.stock) || 0;
          v.minOrder = parseFloat(v.minOrder) || 1;
        });
      }
    });
    this.#cache = parsed;
    return this.#cache;
  }

  async query(spec = {}) {
    let products = await this.#load();
    const { search, category, minPrice, maxPrice, sort, limit, includeInactive } = spec;

    if (!includeInactive) {
      products = products.filter(p => p.active !== false);
    }

    if (search && search.trim()) {
      const terms = search.trim().toLowerCase().split(/\s+/);
      const threshold = 2;
      const scored = products.map(p => {
        const nameLower = p.name.toLowerCase();
        const descLower = (p.desc || '').toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (nameLower.includes(term) || descLower.includes(term)) {
            score += 3;
          } else {
            const words = nameLower.split(' ');
            for (const w of words) {
              if (levenshtein(w, term) <= threshold) {
                score += 2;
                break;
              }
            }
            if (score === 0) {
              const catWords = p.category.toLowerCase().split(' ');
              for (const cw of catWords) {
                if (levenshtein(cw, term) <= threshold) {
                  score += 1;
                  break;
                }
              }
            }
          }
        }
        return { ...p, _score: score };
      });
      const filtered = scored.filter(p => p._score > 0);
      filtered.sort((a, b) => b._score - a._score);
      products = filtered;
    }

    if (category) {
      products = products.filter(p => p.category === category);
    }
    if (minPrice !== undefined && minPrice !== '') {
      products = products.filter(p => p.price >= parseFloat(minPrice));
    }
    if (maxPrice !== undefined && maxPrice !== '') {
      products = products.filter(p => p.price <= parseFloat(maxPrice));
    }
    if (sort) {
      products.sort((a, b) => (a[sort] > b[sort]) ? 1 : -1);
    } else {
      products.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }
    if (limit) {
      products = products.slice(0, limit);
    }
    return products;
  }

  async mutate(command) {
    let products = await this.#load();
    let result;
    switch (command.type) {
      case 'ADD': {
        const np = {
          id: crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now(),
          ...command.payload,
          createdAt: new Date().toISOString()
        };
        np.price = parseFloat(np.price) || 0;
        np.stock = parseFloat(np.stock) || 0;
        np.minOrder = parseFloat(np.minOrder) || 1;
        np.rating = parseFloat(np.rating) || 0;
        np.sortOrder = parseFloat(np.sortOrder) || 0;
        products.push(np);
        result = np;
        break;
      }
      case 'UPDATE': {
        const idx = products.findIndex(p => p.id === command.payload.id);
        if (idx === -1) throw new Error('المنتج غير موجود');
        const updated = { ...products[idx], ...command.payload };
        updated.price = parseFloat(updated.price) || 0;
        updated.stock = parseFloat(updated.stock) || 0;
        updated.minOrder = parseFloat(updated.minOrder) || 1;
        updated.rating = parseFloat(updated.rating) || 0;
        updated.sortOrder = parseFloat(updated.sortOrder) || 0;
        products[idx] = updated;
        result = updated;
        break;
      }
      case 'DELETE': {
        products = products.filter(p => p.id !== command.payload.id);
        result = { deleted: true };
        break;
      }
      default:
        throw new Error('أمر غير معروف');
    }
    await this.#adapter.set('nokhba_products', products);
    this.#cache = null;
    return result;
  }

  async getAll(includeInactive = false) {
    return this.query({ includeInactive });
  }

  async getById(id) {
    const all = await this.getAll(true);
    return all.find(p => p.id === id) || null;
  }

  async getRecommendations(productId, limit = 4) {
    const all = await this.getAll();
    const target = all.find(p => p.id === productId);
    if (!target) return [];
    const sameCat = all.filter(p => p.category === target.category && p.id !== productId);
    return sameCat
      .sort((a, b) => Math.abs(a.price - target.price) - Math.abs(b.price - target.price))
      .slice(0, limit);
  }
}

// ================================================================
// 4. BLOG MANAGER
// ================================================================

export class BlogManager {
  #adapter;
  #cache = null;

  constructor(adapter = new FirebaseAdapter()) {
    this.#adapter = adapter;
  }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_blog_posts');
    const defaults = [];
    this.#cache = (data && data.length) ? data : defaults;
    this.#cache.forEach(post => { post.image = migrateStaticImage(post.image); });
    return this.#cache;
  }

  async getAll() {
    const posts = await this.#load();
    return posts.filter(p => p.published !== false);
  }

  async getById(id) {
    const posts = await this.#load();
    return posts.find(p => p.id === id) || null;
  }

  async mutate(command) {
    let posts = await this.#load();
    let result;
    switch (command.type) {
      case 'ADD': {
        const np = {
          id: crypto.randomUUID ? crypto.randomUUID() : 'b' + Date.now(),
          ...command.payload,
          date: new Date().toISOString()
        };
        posts.push(np);
        result = np;
        break;
      }
      case 'UPDATE': {
        const idx = posts.findIndex(p => p.id === command.payload.id);
        if (idx === -1) throw new Error('المقال غير موجود');
        posts[idx] = { ...posts[idx], ...command.payload };
        result = posts[idx];
        break;
      }
      case 'DELETE': {
        posts = posts.filter(p => p.id !== command.payload.id);
        result = { deleted: true };
        break;
      }
    }
    await this.#adapter.set('nokhba_blog_posts', posts);
    this.#cache = null;
    return result;
  }
}

// ================================================================
// 5. CONTACT MANAGER
// ================================================================

export class ContactManager {
  #adapter;
  #cache = null;

  constructor(adapter = new FirebaseAdapter()) {
    this.#adapter = adapter;
  }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_contact_info');
    const defaults = {
      address: 'عدن، جولة عبد القوي فكة كونكورد – مقابل ثلاجة بلعيد',
      phone: '+967782826727',
      whatsapp: '967782826727',
    };
    this.#cache = data || defaults;
    return this.#cache;
  }

  async get() { return this.#load(); }

  async update(data) {
    const current = await this.#load();
    const updated = { ...current, ...data };
    await this.#adapter.set('nokhba_contact_info', updated);
    this.#cache = null;
    return updated;
  }

  async reset() {
    const defaults = { address: 'عدن', phone: '+967782826727' };
    await this.#adapter.set('nokhba_contact_info', defaults);
    this.#cache = null;
    return defaults;
  }
}

// ================================================================
// 6. TYPING ENGINE
// ================================================================

export class TypingEngine {
  #phrases = [];
  #currentIndex = 0;
  #isDeleting = false;
  #currentText = '';
  #speed = 50;
  #deleteSpeed = 30;
  #pause = 2000;
  #element = null;
  #cursorElement = null;
  #isRunning = false;
  #timeoutId = null;
  #enabled = true;

  constructor() { this.#loadSettings(); }

  #loadSettings() {
    try {
      const saved = localStorage.getItem('nokhba_typing_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.#enabled = settings.enabled !== undefined ? settings.enabled : true;
        this.#phrases = settings.phrases && settings.phrases.length > 0 ? settings.phrases : ['مرحباً بك'];
        this.#speed = settings.speed || 50;
        this.#deleteSpeed = settings.deleteSpeed || 30;
        this.#pause = settings.pause || 2000;
        return;
      }
    } catch (e) {}
    this.#phrases = ['مرحباً بك في النخبة للكهربائيات'];
  }

  start(element, cursorElement = null) {
    if (!this.#enabled) {
      if (element) element.textContent = '';
      if (cursorElement) cursorElement.style.display = 'none';
      return;
    }
    this.#element = element;
    this.#cursorElement = cursorElement;
    this.#isRunning = true;
    this.#type();
  }

  #type() {
    if (!this.#isRunning || !this.#enabled) return;
    const currentPhrase = this.#phrases[this.#currentIndex];
    if (!currentPhrase) { this.#currentIndex = 0; this.#type(); return; }

    if (this.#isDeleting) {
      this.#currentText = currentPhrase.substring(0, this.#currentText.length - 1);
    } else {
      this.#currentText = currentPhrase.substring(0, this.#currentText.length + 1);
    }

    if (this.#element) this.#element.textContent = this.#currentText;

    let delay = this.#isDeleting ? this.#deleteSpeed : this.#speed;
    
    if (this.#currentText === currentPhrase) {
      delay = this.#pause;
      this.#isDeleting = true;
    } else if (this.#currentText === '') {
      this.#isDeleting = false;
      this.#currentIndex = (this.#currentIndex + 1) % this.#phrases.length;
      delay = this.#pause / 3;
    }
    this.#timeoutId = setTimeout(() => this.#type(), delay);
  }

  stop() {
    this.#isRunning = false;
    if (this.#timeoutId) clearTimeout(this.#timeoutId);
  }
}

// ================================================================
// 7. LIGHTNING ENGINE 
// ================================================================
export class LightningEngine {
  init(container) {}
  spawn(x, y, intensity = 1) {}
}

// ================================================================
// 8. THUNDER ENGINE
// ================================================================
export class ThunderEngine {
  init() {}
  play(intensity = 1) {}
}

// ================================================================
// 9. HERO IMAGES MANAGER
// ================================================================
export class HeroImagesManager {
  #images = [];
  constructor(adapter = new LocalStorageAdapter()) {
    this.#images = [
      { image: '/public/images/products/27.jpg', badge: '⚡ عرض خاص', title: 'أفضل <span class="highlight">الكهربائيات</span> بأسعار تنافسية', desc: 'جودة عالية.', btn: 'تسوق الآن', action: 'shop' }
    ];
  }
  getAll() { return [...this.#images]; }
}

// ================================================================
// 10. IMAGE UPLOADER (ImgBB)
// ================================================================
export class ImageUploader {
  static async uploadFile(file) {
    if (!file) return null;
    const apiKey = "a2429d609080c139ccdaa5a789cf6928"; 
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        return data.data.url;
      } else {
        throw new Error(data.error.message);
      }
    } catch (error) {
      console.error("حدث خطأ أثناء رفع الصورة:", error);
      throw error;
    }
  }
}

// ================================================================
// 11. UTILITY FUNCTIONS
// ================================================================

export function showToast(message, duration = 3500, icon = '✨') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

export function getCart() {
  try { return JSON.parse(localStorage.getItem('nokhba_cart') || '[]'); } catch { return []; }
}

export function saveCart(cart) {
  localStorage.setItem('nokhba_cart', JSON.stringify(cart));
}

export function getOrders() {
  try { return JSON.parse(localStorage.getItem('nokhba_orders') || '[]'); } catch { return []; }
}

export function saveOrders(orders) {
  localStorage.setItem('nokhba_orders', JSON.stringify(orders));
}

export function getTheme() {
  return localStorage.getItem('nokhba_theme') || 'dark';
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nokhba_theme', theme);
}

export function getBackground() {
  return localStorage.getItem('nokhba_bg_image') || '';
}

export function setBackground(base64) {
  localStorage.setItem('nokhba_bg_image', base64);
  applyBackground(base64);
}

export function applyBackground(base64) {
  if (base64 && base64.startsWith('data:image')) {
    document.body.style.setProperty('--bg-image', `url(${base64})`);
  } else {
    document.body.style.setProperty('--bg-image', 'none');
  }
}

export function getFooterImage() {
  return localStorage.getItem('nokhba_footer_image') || '';
}

export function setFooterImage(base64) {
  localStorage.setItem('nokhba_footer_image', base64);
  applyFooterImage(base64);
}

export function applyFooterImage(base64) {
  const footer = document.getElementById('siteFooter');
  if (!footer) return;
  if (base64 && base64.startsWith('data:image')) {
    footer.style.backgroundImage = `url(${base64})`;
  } else {
    footer.style.backgroundImage = 'none';
  }
}

export function getVariantPrice(product, variantSize) {
  return product.price;
}

export function getVariantStock(product, variantSize) {
  return product.stock;
}

export function getVariantMinOrder(product, variantSize) {
  return product.minOrder || 1;
}

export function getAvailableSizes(product) {
  return [];
}

if (typeof THREE !== 'undefined' && !window.__THREE_LOADED) {
  window.__THREE_LOADED = true;
}

console.log('⚡ النخبة – النواة الأسطورية جاهزة');
