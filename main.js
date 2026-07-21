// ================================================================
// main.js – النواة الأسطورية لمتجر النخبة (النسخة الهندسية v9.0)
// يدعم المواصفات الفنية، التبويبات، والأداء
// ================================================================

import * as THREE from 'three';

// ================================================================
// إعدادات Firebase السحابية
// ================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  async set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  async remove(key) { localStorage.removeItem(key); }
  async clear() { localStorage.clear(); }
}

export class FirebaseAdapter extends StorageAdapter {
  async get(key) {
    try {
      const docRef = doc(db, "nokhba_db", key);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data().value : null;
    } catch (e) { console.error("خطأ في جلب البيانات من فايربيس:", e); return null; }
  }
  async set(key, value) {
    try { await setDoc(doc(db, "nokhba_db", key), { value }); } catch (e) { console.error("خطأ في حفظ البيانات:", e); }
  }
  async remove(key) {
    try { await deleteDoc(doc(db, "nokhba_db", key)); } catch (e) { console.error("خطأ في الحذف:", e); }
  }
  async clear() { console.warn("تم إيقاف مسح قاعدة البيانات بالكامل للحماية"); }
}

// ================================================================
// 2. CATEGORY MANAGER – إدارة الفئات الديناميكية
// ================================================================

export class CategoryManager {
  #adapter; #cache = null;
  constructor(adapter = new FirebaseAdapter()) { this.#adapter = adapter; }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_categories');
    this.#cache = (data && Array.isArray(data)) ? data : [];
    return this.#cache;
  }

  async getAll() { return this.#load(); }

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
      if (p.category === trimmed) { p.category = ''; await productManager.mutate({ type: 'UPDATE', payload: p }); }
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
// 3. PRODUCT MANAGER – إدارة المنتجات المتطورة
// ================================================================

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

function levenshtein(a, b) {
  if (a.length === 0) return b.length; if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = matrix[0]; matrix[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const temp = matrix[i];
      matrix[i] = Math.min(prev + (a[i - 1] === b[j - 1] ? 0 : 1), matrix[i] + 1, matrix[i - 1] + 1);
      prev = temp;
    }
  }
  return matrix[a.length];
}

export class ProductManager {
  #adapter; #cache = null;
  constructor(adapter = new FirebaseAdapter()) { this.#adapter = adapter; }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_products');
    const defaults = [
      {
        id: 'p1', name: 'مفتاح تيار 32A', category: 'مفاتيح', price: 45, stock: 100, minOrder: 1,
        rating: 4.5, isNew: true, isBestSeller: false, active: true, sortOrder: 1,
        image: '/public/images/products/1.jpg', images: ['/public/images/products/1.jpg'], video: null,
        desc: 'مفتاح تيار عالي الجودة 32 أمبير، مثالي للاستخدام المنزلي والصناعي.',
        specifications: { 'الجهد المقنن': '230/400V', 'التيار المقنن': '32A', 'تردد التشغيل': '50/60Hz', 'درجة الحماية': 'IP20', 'مادة التصنيع': 'بولي كربونات', 'الوزن': '120g', 'الضمان': 'سنتان' },
        diagram: '', variants: [], power: 0
      },
      {
        id: 'p2', name: 'كابل نحاس 10مم', category: 'كابلات', price: 120, stock: 50, minOrder: 1,
        rating: 4.2, isNew: false, isBestSeller: true, active: true, sortOrder: 2,
        image: '/public/images/products/2.jpg', images: ['/public/images/products/2.jpg'], video: null,
        desc: 'كابل نحاس نقي 10 مم للاستخدامات الصناعية والمنزلية.',
        specifications: { 'المقطع': '10mm²', 'المادة': 'نحاس نقي', 'العزل': 'PVC مقاوم للحرارة', 'الضمان': '5 سنوات' },
        diagram: '', variants: [], power: 0
      },
      {
        id: 'p3', name: 'لمبة Hifi LED 40W', category: 'إضاءة', price: 8.30, stock: 200, minOrder: 2,
        rating: 4.8, isNew: true, isBestSeller: true, active: true, sortOrder: 3,
        image: '/public/images/products/3.png', images: ['/public/images/products/3.png'], video: null,
        desc: 'لمبة LED موفرة للطاقة بقدرة 40 وات، إضاءة عالية الجودة.',
        specifications: { 'القدرة': '40W', 'التدفق الضوئي': '4000 لومن', 'العمر الافتراضي': '25000 ساعة', 'الضمان': 'سنتان' },
        diagram: '', variants: [], power: 40
      },
      {
        id: 'p4', name: 'مفتاح 14.00 SAR', category: 'مفاتيح', price: 14, stock: 80, minOrder: 1,
        rating: 3.8, isNew: false, isBestSeller: false, active: true, sortOrder: 4,
        image: '/public/images/products/4.png', images: ['/public/images/products/4.png'], video: null,
        desc: 'مفتاح كهربائي بجودة عالية وسعر مناسب.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p5', name: 'كابل 0Y - 35.00 SAR', category: 'كابلات', price: 35, stock: 30, minOrder: 1,
        rating: 4.0, isNew: false, isBestSeller: false, active: true, sortOrder: 5,
        image: '/public/images/products/5.png', images: ['/public/images/products/5.png'], video: null,
        desc: 'كابل كهربائي 0Y بمقاومة عالية وجودة ممتازة.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p6', name: 'قابس 7 - 2.20 SAR', category: 'قوابس', price: 2.20, stock: 500, minOrder: 5,
        rating: 4.3, isNew: false, isBestSeller: true, active: true, sortOrder: 6,
        image: '/public/images/products/6.jpg', images: ['/public/images/products/6.jpg'], video: null,
        desc: 'قابس كهربائي متعدد الاستخدامات بجودة عالية.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p7', name: 'مقبس E27 - 2.20 SAR', category: 'مقابس', price: 2.20, stock: 300, minOrder: 3,
        rating: 4.1, isNew: false, isBestSeller: false, active: true, sortOrder: 7,
        image: '/public/images/products/7.jpg', images: ['/public/images/products/7.jpg'], video: null,
        desc: 'مقبس E27 بجودة ممتازة وسعر اقتصادي.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p8', name: 'مفتاح 15.00 SAR', category: 'مفاتيح', price: 15, stock: 60, minOrder: 1,
        rating: 3.5, isNew: false, isBestSeller: false, active: true, sortOrder: 8,
        image: '/public/images/products/8.jpg', images: ['/public/images/products/8.jpg'], video: null,
        desc: 'مفتاح كهربائي بتصميم عصري وأداء موثوق.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p9', name: 'كابل 20W - 15.00 SAR', category: 'كابلات', price: 15, stock: 40, minOrder: 1,
        rating: 4.4, isNew: true, isBestSeller: false, active: true, sortOrder: 9,
        image: '/public/images/products/9.jpg', images: ['/public/images/products/9.jpg'], video: null,
        desc: 'كابل 20 وات عالي الجودة للاستخدامات المختلفة.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p10', name: 'محول 3.50 SAR', category: 'محولات', price: 3.50, stock: 150, minOrder: 2,
        rating: 4.6, isNew: false, isBestSeller: true, active: true, sortOrder: 10,
        image: '/public/images/products/10.jpg', images: ['/public/images/products/10.jpg'], video: null,
        desc: 'محول كهربائي متعدد الاستخدامات بجودة عالية.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p11', name: 'محول 6.00 SAR', category: 'محولات', price: 6, stock: 120, minOrder: 1,
        rating: 4.0, isNew: false, isBestSeller: false, active: true, sortOrder: 11,
        image: '/public/images/products/11.jpg', images: ['/public/images/products/11.jpg'], video: null,
        desc: 'محول كهربائي بقدرة عالية وجودة ممتازة.',
        specifications: {}, diagram: '', variants: [], power: 0
      },
      {
        id: 'p12', name: 'لمبة LED متعددة المقاسات', category: 'إضاءة', price: 10, stock: 0, minOrder: 1,
        rating: 4.7, isNew: true, isBestSeller: true, active: true, sortOrder: 12,
        image: '/public/images/products/12.jpg', images: ['/public/images/products/12.jpg'], video: null,
        desc: 'لمبة LED متعددة المقاسات – اختر المقاس المناسب.',
        specifications: { 'العمر الافتراضي': '25000 ساعة', 'الضمان': 'سنتان' },
        diagram: '', variants: [
          { size: '20 وات', price: 10, stock: 100, minOrder: 6, power: 20 },
          { size: '30 وات', price: 15, stock: 80, minOrder: 4, power: 30 },
          { size: '40 وات', price: 20, stock: 60, minOrder: 3, power: 40 },
          { size: '50 وات', price: 25, stock: 40, minOrder: 2, power: 50 }
        ], power: 20
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
      p.power = parseFloat(p.power) || 0;
      if (!p.specifications) p.specifications = {};
      if (p.variants) {
        p.variants.forEach(v => {
          v.price = parseFloat(v.price) || 0;
          v.stock = parseFloat(v.stock) || 0;
          v.minOrder = parseFloat(v.minOrder) || 1;
          v.power = parseFloat(v.power) || 0;
        });
      }
    });
    this.#cache = parsed;
    return this.#cache;
  }

  async query(spec = {}) {
    let products = await this.#load();
    const { search, category, minPrice, maxPrice, sort, limit, includeInactive } = spec;
    if (!includeInactive) products = products.filter(p => p.active !== false);
    if (search && search.trim()) {
      const terms = search.trim().toLowerCase().split(/\s+/);
      const threshold = 2;
      const scored = products.map(p => {
        const nameLower = p.name.toLowerCase();
        const descLower = (p.desc || '').toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (nameLower.includes(term) || descLower.includes(term)) { score += 3; }
          else {
            const words = nameLower.split(' ');
            for (const w of words) { if (levenshtein(w, term) <= threshold) { score += 2; break; } }
            if (score === 0) {
              const catWords = p.category.toLowerCase().split(' ');
              for (const cw of catWords) { if (levenshtein(cw, term) <= threshold) { score += 1; break; } }
            }
          }
        }
        return { ...p, _score: score };
      });
      const filtered = scored.filter(p => p._score > 0);
      filtered.sort((a, b) => b._score - a._score);
      products = filtered;
    }
    if (category) products = products.filter(p => p.category === category);
    if (minPrice !== undefined && minPrice !== '') products = products.filter(p => p.price >= parseFloat(minPrice));
    if (maxPrice !== undefined && maxPrice !== '') products = products.filter(p => p.price <= parseFloat(maxPrice));
    if (sort) products.sort((a, b) => (a[sort] > b[sort]) ? 1 : -1);
    else products.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    if (limit) products = products.slice(0, limit);
    return products;
  }

  async mutate(command) {
    let products = await this.#load();
    let result;
    switch (command.type) {
      case 'ADD': {
        const np = { id: crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now(), ...command.payload, createdAt: new Date().toISOString() };
        np.price = parseFloat(np.price) || 0; np.stock = parseFloat(np.stock) || 0; np.minOrder = parseFloat(np.minOrder) || 1;
        np.rating = parseFloat(np.rating) || 0; np.sortOrder = parseFloat(np.sortOrder) || 0; np.power = parseFloat(np.power) || 0;
        if (!np.specifications) np.specifications = {};
        if (np.variants) {
          np.variants.forEach(v => {
            v.price = parseFloat(v.price) || 0; v.stock = parseFloat(v.stock) || 0; v.minOrder = parseFloat(v.minOrder) || 1; v.power = parseFloat(v.power) || 0;
          });
        }
        products.push(np); result = np; break;
      }
      case 'UPDATE': {
        const idx = products.findIndex(p => p.id === command.payload.id);
        if (idx === -1) throw new Error('المنتج غير موجود');
        const updated = { ...products[idx], ...command.payload };
        updated.price = parseFloat(updated.price) || 0; updated.stock = parseFloat(updated.stock) || 0;
        updated.minOrder = parseFloat(updated.minOrder) || 1; updated.rating = parseFloat(updated.rating) || 0;
        updated.sortOrder = parseFloat(updated.sortOrder) || 0; updated.power = parseFloat(updated.power) || 0;
        if (!updated.specifications) updated.specifications = {};
        if (updated.variants) {
          updated.variants.forEach(v => {
            v.price = parseFloat(v.price) || 0; v.stock = parseFloat(v.stock) || 0; v.minOrder = parseFloat(v.minOrder) || 1; v.power = parseFloat(v.power) || 0;
          });
        }
        products[idx] = updated; result = updated; break;
      }
      case 'DELETE': products = products.filter(p => p.id !== command.payload.id); result = { deleted: true }; break;
      default: throw new Error('أمر غير معروف');
    }
    await this.#adapter.set('nokhba_products', products); this.#cache = null; return result;
  }

  async getAll(includeInactive = false) { return this.query({ includeInactive }); }
  async getById(id) { const all = await this.getAll(true); return all.find(p => p.id === id) || null; }

  async getRecommendations(productId, limit = 4) {
    const all = await this.getAll();
    const target = all.find(p => p.id === productId);
    if (!target) return [];
    const sameCat = all.filter(p => p.category === target.category && p.id !== productId);
    return sameCat.sort((a, b) => Math.abs(a.price - target.price) - Math.abs(b.price - target.price)).slice(0, limit);
  }
}

// ================================================================
// 4. BLOG MANAGER
// ================================================================
export class BlogManager {
  #adapter; #cache = null;
  constructor(adapter = new FirebaseAdapter()) { this.#adapter = adapter; }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_blog_posts');
    const defaults = [
      { id: 'b1', title: 'أحدث تقنيات الطاقة الشمسية في اليمن', slug: 'احدث-تقنيات-الطاقة-الشمسية', excerpt: 'نستعرض في هذا المقال أحدث التطورات...', content: '<p>تفاصيل المقال...</p>', image: '/public/images/products/30.jpg', date: new Date().toISOString(), author: 'فريق النخبة', tags: ['طاقة شمسية', 'تقنية', 'اليمن'], published: true },
      { id: 'b2', title: 'كيف تختار القاطع الكهربائي المناسب؟', slug: 'كيف-تختار-القاطع-الكهربائي', excerpt: 'دليل شامل لاختيار القواطع الكهربائية...', content: '<p>دليل كامل...</p>', image: '/public/images/products/31.jpg', date: new Date(Date.now() - 86400000 * 3).toISOString(), author: 'مهندس كهرباء', tags: ['قواطع', 'كهرباء', 'دليل'], published: true }
    ];
    this.#cache = (data && data.length) ? data : defaults;
    this.#cache.forEach(post => { post.image = migrateStaticImage(post.image); });
    return this.#cache;
  }

  async getAll() { const posts = await this.#load(); return posts.filter(p => p.published !== false); }
  async getById(id) { const posts = await this.#load(); return posts.find(p => p.id === id) || null; }
  async getBySlug(slug) { const posts = await this.#load(); return posts.find(p => p.slug === slug && p.published !== false) || null; }
  async mutate(command) {
    let posts = await this.#load(); let result;
    switch (command.type) {
      case 'ADD': { const np = { id: crypto.randomUUID ? crypto.randomUUID() : 'b' + Date.now(), ...command.payload, date: new Date().toISOString() }; posts.push(np); result = np; break; }
      case 'UPDATE': { const idx = posts.findIndex(p => p.id === command.payload.id); if (idx === -1) throw new Error('المقال غير موجود'); posts[idx] = { ...posts[idx], ...command.payload }; result = posts[idx]; break; }
      case 'DELETE': posts = posts.filter(p => p.id !== command.payload.id); result = { deleted: true }; break;
      default: throw new Error('أمر غير معروف');
    }
    await this.#adapter.set('nokhba_blog_posts', posts); this.#cache = null; return result;
  }
  async getRecent(limit = 3) { const posts = await this.getAll(); return posts.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit); }
}

// ================================================================
// 5. CONTACT MANAGER
// ================================================================
export class ContactManager {
  #adapter; #cache = null;
  constructor(adapter = new FirebaseAdapter()) { this.#adapter = adapter; }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_contact_info');
    const defaults = {
      address: 'عدن، جولة عبد القوي فكة كونكورد – مقابل ثلاجة بلعيد', phone: '+967782826727', email: 'info@nokhba-electric.com',
      whatsapp: '967782826727', facebook: 'https://facebook.com/nokhba', instagram: 'https://instagram.com/nokhba',
      twitter: 'https://twitter.com/nokhba', youtube: 'https://youtube.com/nokhba',
      mapEmbed: '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.123456!2d45.123456!3d12.123456!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDA3JzI0LjYiTiA0NcKwMDcnMjQuMCJF!5e0!3m2!1sar!2sye!4v1234567890" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy"></iframe>',
      openingHours: 'السبت - الخميس: 9:00 ص - 9:00 م'
    };
    this.#cache = data || defaults; return this.#cache;
  }

  async get() { return this.#load(); }
  async update(data) { const current = await this.#load(); const updated = { ...current, ...data }; await this.#adapter.set('nokhba_contact_info', updated); this.#cache = null; return updated; }
  async reset() { const defaults = { /* ... same as above ... */ }; await this.#adapter.set('nokhba_contact_info', defaults); this.#cache = null; return defaults; }
}

// ================================================================
// 6. TYPING ENGINE
// ================================================================
export class TypingEngine {
  #phrases = []; #currentIndex = 0; #isDeleting = false; #currentText = ''; #speed = 50; #deleteSpeed = 30; #pause = 2000;
  #element = null; #cursorElement = null; #isRunning = false; #timeoutId = null; #onPhraseChange = null; #enabled = true;

  constructor() { this.#loadSettings(); }

  #loadSettings() {
    try {
      const saved = localStorage.getItem('nokhba_typing_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.#enabled = settings.enabled !== undefined ? settings.enabled : true;
        if (settings.phrases && settings.phrases.length > 0) { this.#phrases = settings.phrases; } else { this.#loadDefaultPhrases(); }
        this.#speed = settings.speed || 50; this.#deleteSpeed = settings.deleteSpeed || 30; this.#pause = settings.pause || 2000; return;
      }
    } catch (e) {}
    this.#loadDefaultPhrases();
  }

  #loadDefaultPhrases() { this.#phrases = ['مرحباً بك في النخبة للكهربائيات','جودة عالية وأسعار تنافسية','توصيل سريع إلى جميع أنحاء عدن','نحن نصنع الفرق في عالم الكهرباء','أفضل المنتجات بأفضل الأسعار']; }

  start(element, cursorElement = null) {
    if (!this.#enabled) { if (element) element.textContent = ''; if (cursorElement) cursorElement.style.display = 'none'; return; }
    this.#element = element; this.#cursorElement = cursorElement; this.#isRunning = true; this.#type();
  }

  #type() {
    if (!this.#isRunning || !this.#enabled) return;
    const currentPhrase = this.#phrases[this.#currentIndex];
    if (!currentPhrase) { this.#currentIndex = 0; this.#type(); return; }
    if (this.#isDeleting) { this.#currentText = currentPhrase.substring(0, this.#currentText.length - 1); }
    else { this.#currentText = currentPhrase.substring(0, this.#currentText.length + 1); }
    if (this.#element) this.#element.textContent = this.#currentText;
    let delay = this.#isDeleting ? this.#deleteSpeed : this.#speed;
    if (this.#currentText === currentPhrase) { delay = this.#pause; this.#isDeleting = true; if (this.#onPhraseChange) this.#onPhraseChange(currentPhrase, this.#currentIndex); }
    else if (this.#currentText === '') { this.#isDeleting = false; this.#currentIndex = (this.#currentIndex + 1) % this.#phrases.length; delay = this.#pause / 3; }
    this.#timeoutId = setTimeout(() => this.#type(), delay);
  }

  stop() { this.#isRunning = false; if (this.#timeoutId) { clearTimeout(this.#timeoutId); this.#timeoutId = null; } }
  reload() { this.stop(); this.#loadSettings(); this.#currentIndex = 0; this.#isDeleting = false; this.#currentText = ''; this.#isRunning = true; this.#type(); }
  setPhrases(phrases) { if (Array.isArray(phrases) && phrases.length > 0) { this.#phrases = phrases; this.#saveSettings(); this.reload(); return true; } return false; }
  getPhrases() { return [...this.#phrases]; }
  onPhraseChange(callback) { this.#onPhraseChange = callback; }
  setSpeed(speed) { this.#speed = Math.max(10, Math.min(200, speed)); this.#saveSettings(); }
  setDeleteSpeed(speed) { this.#deleteSpeed = Math.max(10, Math.min(100, speed)); this.#saveSettings(); }
  setPause(pause) { this.#pause = Math.max(500, Math.min(5000, pause)); this.#saveSettings(); }
  setEnabled(enabled) { this.#enabled = enabled; if (!enabled) { this.stop(); if (this.#element) this.#element.textContent = ''; if (this.#cursorElement) this.#cursorElement.style.display = 'none'; } else { if (this.#cursorElement) this.#cursorElement.style.display = 'inline-block'; this.reload(); } this.#saveSettings(); }
  isEnabled() { return this.#enabled; }
  #saveSettings() { try { const settings = { enabled: this.#enabled, phrases: this.#phrases, speed: this.#speed, deleteSpeed: this.#deleteSpeed, pause: this.#pause }; localStorage.setItem('nokhba_typing_settings', JSON.stringify(settings)); } catch (e) {} }
}

// ================================================================
// 7. LIGHTNING ENGINE
// ================================================================
export class LightningEngine {
  #scene; #camera; #renderer; #clock = new THREE.Clock(); #bolts = []; #container = null; #isMobile = false; #enabled = true;

  init(container) {
    this.#container = container;
    this.#isMobile = window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    this.#init3D();
  }

  #init3D() {
    this.#scene = new THREE.Scene();
    this.#camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.#camera.position.z = 1;
    this.#renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.#renderer.setSize(this.#container.clientWidth, this.#container.clientHeight);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.#isMobile ? 1 : 1.5));
    this.#renderer.setClearColor(0x000000, 0);
    this.#container.appendChild(this.#renderer.domElement);
    this.#animate3D();
    window.addEventListener('resize', () => { this.#renderer?.setSize(this.#container.clientWidth, this.#container.clientHeight); });
  }

  #animate3D = () => {
    requestAnimationFrame(this.#animate3D);
    if (!this.#enabled || !this.#renderer) return;
    const delta = Math.min(this.#clock.getDelta(), 0.05);
    for (let i = this.#bolts.length - 1; i >= 0; i--) {
      const b = this.#bolts[i];
      b.age += delta;
      if (b.age > b.life) {
        b.parts.forEach(part => { this.#scene.remove(part.line); this.#scene.remove(part.glow); this.#scene.remove(part.shadow); part.line.geometry.dispose?.(); part.glow.geometry.dispose?.(); part.shadow.geometry.dispose?.(); });
        this.#scene.remove(b.sparks); b.sparks.geometry.dispose?.(); this.#bolts.splice(i, 1);
      } else {
        const alpha = 1 - b.age / b.life;
        b.parts.forEach(part => { part.line.material.opacity = alpha * 0.9; part.glow.material.opacity = alpha * 0.5; part.shadow.material.opacity = alpha * 0.25; });
        b.sparks.material.opacity = alpha * 0.8; b.sparks.material.size = 0.015 * (0.5 + 0.5 * alpha);
      }
    }
    this.#renderer.render(this.#scene, this.#camera);
  };

  spawn(x, y, intensity = 1) {
    if (!this.#enabled) return;
    const nx = (x / window.innerWidth) * 2 - 1; const ny = -(y / window.innerHeight) * 2 + 1;
    const numSegments = this.#isMobile ? 12 + Math.floor(intensity * 6) : 18 + Math.floor(intensity * 10);
    const mainPath = this.#generateLightningPath(nx, ny, numSegments, intensity);
    const branches = this.#generateBranches(mainPath, intensity);
    const parts = []; const allPaths = [mainPath, ...branches];
    allPaths.forEach(path => {
      if (path.length < 2) return;
      const points = path.map(p => new THREE.Vector3(p.x, p.y, 0));
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const coreMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, linewidth: 1 });
      const coreLine = new THREE.Line(geom.clone(), coreMat); this.#scene.add(coreLine);
      const glowMat = new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, linewidth: 2 });
      const glowLine = new THREE.Line(geom.clone(), glowMat); this.#scene.add(glowLine);
      const shadowMat = new THREE.LineBasicMaterial({ color: 0x4466ff, transparent: true, opacity: 0.25, linewidth: 3 });
      const shadowLine = new THREE.Line(geom.clone(), shadowMat); this.#scene.add(shadowLine);
      parts.push({ line: coreLine, glow: glowLine, shadow: shadowLine });
    });
    const sparkCount = this.#isMobile ? 20 : 40 + Math.floor(intensity * 20);
    const positions = [];
    for (let i = 0; i < sparkCount; i++) {
      const idx = Math.floor(Math.random() * mainPath.length);
      const p = mainPath[idx];
      positions.push(p.x + (Math.random() - 0.5) * 0.08, p.y + (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.04);
    }
    const sparkGeom = new THREE.BufferGeometry();
    sparkGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const sparkMat = new THREE.PointsMaterial({ color: 0xffdd88, size: 0.015, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    const sparks = new THREE.Points(sparkGeom, sparkMat); this.#scene.add(sparks);
    this.#bolts.push({ parts, sparks, life: 0.3 + Math.random() * 0.15, age: 0 });
  }

  #generateLightningPath(startX, startY, numPoints, intensity) {
    const path = [{ x: startX, y: startY }]; let dx = (Math.random() - 0.5) * 0.15; let dy = -0.04 - Math.random() * 0.03;
    for (let i = 0; i < numPoints; i++) {
      const step = i / numPoints; const jitter = 0.04 + step * 0.12; const prev = path[path.length - 1];
      dx += (Math.random() - 0.5) * 0.04; dy += (Math.random() - 0.5) * 0.015;
      dx = Math.max(-0.12, Math.min(0.12, dx)); dy = Math.max(-0.08, Math.min(-0.01, dy));
      path.push({ x: prev.x + dx + (Math.random() - 0.5) * jitter, y: prev.y + dy + (Math.random() - 0.5) * jitter * 0.5 });
    }
    return path;
  }

  #generateBranches(mainPath, intensity) {
    const branches = []; const numBranches = this.#isMobile ? 1 + Math.floor(intensity * 1.5) : 2 + Math.floor(intensity * 3);
    const indices = [];
    for (let i = 0; i < numBranches; i++) { const idx = Math.floor(2 + Math.random() * (mainPath.length - 4)); if (!indices.includes(idx)) indices.push(idx); }
    indices.forEach((idx, order) => {
      const start = mainPath[idx]; const dir = (order % 2 === 0) ? 1 : -1; const angle = (Math.random() * 0.8 + 0.3) * dir;
      const branch = [{ x: start.x, y: start.y }]; let cx = start.x, cy = start.y;
      for (let i = 0; i < 6 + Math.floor(intensity * 3); i++) { const step = i / 6; const jitter = 0.02 + step * 0.04; cx += Math.cos(angle + step * 0.3 * dir) * 0.02 * intensity; cy -= 0.025 + Math.random() * 0.01; cx += (Math.random() - 0.5) * jitter; branch.push({ x: cx, y: cy }); }
      branches.push(branch);
      if (intensity > 0.7 && !this.#isMobile) {
        const subIdx = Math.floor(branch.length * 0.5); const subStart = branch[subIdx]; const subDir = (Math.random() > 0.5) ? 1 : -1;
        const subBranch = [{ x: subStart.x, y: subStart.y }]; let sx = subStart.x, sy = subStart.y;
        for (let i = 0; i < 4; i++) { sx += (Math.random() - 0.5) * 0.04 + subDir * 0.03; sy -= 0.02 + Math.random() * 0.01; subBranch.push({ x: sx, y: sy }); }
        branches.push(subBranch);
      }
    });
    return branches;
  }

  setEnabled(enabled) { this.#enabled = enabled; }
}

// ================================================================
// 8. THUNDER ENGINE
// ================================================================
export class ThunderEngine {
  #audio = null; #ready = false; #initAttempts = 0; #maxInitAttempts = 3;
  constructor() { this.init(); }

  init() {
    if (this.#initAttempts >= this.#maxInitAttempts) return;
    this.#initAttempts++;
    try {
      this.#audio = new Audio('/public/sounds/thunder.mp3'); this.#audio.preload = 'auto'; this.#audio.volume = 0.7; this.#audio.loop = false;
      this.#audio.oncanplaythrough = () => { this.#ready = true; };
      this.#audio.onloadeddata = () => { this.#ready = true; };
      this.#audio.onerror = () => { this.#ready = false; setTimeout(() => { if (this.#initAttempts < this.#maxInitAttempts) this.init(); }, 2000); };
      this.#audio.load();
      setTimeout(() => { if (!this.#ready && this.#audio) this.#ready = true; }, 3000);
    } catch (err) { this.#ready = false; }
  }

  play(intensity = 1) {
    if (!this.#ready || !this.#audio) { this.init(); setTimeout(() => { if (this.#ready && this.#audio) this._playInternal(intensity); }, 500); return false; }
    return this._playInternal(intensity);
  }

  _playInternal(intensity) {
    try {
      this.#audio.currentTime = 0; this.#audio.volume = Math.min(1, Math.max(0.2, 0.3 + intensity * 0.5));
      const playPromise = this.#audio.play();
      if (playPromise !== undefined) { playPromise.catch(() => { this.#audio.load(); setTimeout(() => { this.#audio.play().catch(() => {}); }, 300); }); return true; }
      return true;
    } catch (err) { return false; }
  }

  isReady() { return this.#ready && this.#audio !== null; }
  reload() { this.#initAttempts = 0; this.#ready = false; this.init(); }
}

// ================================================================
// 9. HERO IMAGES MANAGER
// ================================================================
export class HeroImagesManager {
  #images = []; #adapter;
  constructor(adapter = new LocalStorageAdapter()) { this.#adapter = adapter; this.#load(); }

  #load() {
    try {
      const saved = localStorage.getItem('nokhba_hero_images');
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) { this.#images = parsed.map(item => ({ ...item, image: migrateStaticImage(item.image) })); this.#save(); return; } }
    } catch (e) {}
    this.#images = [
      { image: '/public/images/products/27.jpg', badge: '⚡ عرض خاص', title: 'أفضل <span class="highlight">الكهربائيات</span> بأسعار تنافسية', desc: 'جودة عالية، ضمان طويل، وأسعار لا تُقهر – كل ما تحتاجه في مكان واحد.', btn: 'تسوق الآن', action: 'shop' },
      { image: '/public/images/products/28.jpg', badge: '💡 توفير الطاقة', title: 'لمبات <span class="highlight">LED موفرة</span> بنسبة 80%', desc: 'استمتع بإضاءة قوية واستهلاك منخفض – اختر الأفضل لمنزلك أو مشروعك.', btn: 'استكشف اللمبات', action: 'lighting' },
      { image: '/public/images/products/29.jpg', badge: '🔌 توصيل سريع', title: 'طلبك <span class="highlight">يوصلك</span> خلال 24 ساعة', desc: 'في عدن والمناطق المجاورة، نضمن وصول منتجاتك بأمان وسرعة.', btn: 'اطلب الآن', action: 'whatsapp' }
    ];
    this.#save();
  }

  #save() { localStorage.setItem('nokhba_hero_images', JSON.stringify(this.#images)); }
  getAll() { return [...this.#images]; }
  add(data) { if (data.image?.trim()) { this.#images.push({ image: data.image.trim(), badge: data.badge || '✨ عرض', title: data.title || 'منتج جديد', desc: data.desc || '', btn: data.btn || 'تسوق', action: data.action || 'shop' }); this.#save(); return true; } return false; }
  remove(index) { if (index >= 0 && index < this.#images.length) { this.#images.splice(index, 1); this.#save(); return true; } return false; }
  update(index, data) { if (index >= 0 && index < this.#images.length) { this.#images[index] = { ...this.#images[index], ...data }; this.#save(); return true; } return false; }
  reorder(from, to) { if (from >= 0 && from < this.#images.length && to >= 0 && to < this.#images.length) { const [item] = this.#images.splice(from, 1); this.#images.splice(to, 0, item); this.#save(); return true; } return false; }
  reset() { localStorage.removeItem('nokhba_hero_images'); this.#load(); }
}

// ================================================================
// 10. IMAGE UPLOADER
// ================================================================
export class ImageUploader {
  static async uploadFile(file) {
    if (!file) return null;
    const formData = new FormData(); formData.append("image", file);
    try {
      const res = await fetch(`https://api.imgbb.com/1/upload?key=a2429d609080c139ccdaa5a789cf6928`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) return data.data.url;
      throw new Error(data.error.message);
    } catch (e) { console.error("رفع الصورة:", e); throw e; }
  }
}

// ================================================================
// 11. COMMUNITY STATS MANAGER
// ================================================================
export class CommunityStatsManager {
  #adapter; #cache = null;
  constructor(adapter = new FirebaseAdapter()) { this.#adapter = adapter; }
  async #load() { if (this.#cache) return this.#cache; const data = await this.#adapter.get('nokhba_community_stats'); const defaults = { totalPower: 0, totalCustomers: 0, savedHours: 0, lastUpdated: new Date().toISOString() }; this.#cache = data || defaults; return this.#cache; }
  async getStats() { return this.#load(); }
  async updateStats(newStats) { const cur = await this.#load(); const upd = { ...cur, ...newStats, lastUpdated: new Date().toISOString() }; await this.#adapter.set('nokhba_community_stats', upd); this.#cache = null; return upd; }
  async incrementPower(watts) { const cur = await this.#load(); const upd = { ...cur, totalPower: (cur.totalPower||0) + watts, totalCustomers: (cur.totalCustomers||0) + 1, savedHours: (cur.savedHours||0) + (watts/1000) }; await this.#adapter.set('nokhba_community_stats', upd); this.#cache = null; return upd; }
}

// ================================================================
// 12. EMOTIONAL ENGINE
// ================================================================
export class EmotionalEngine {
  #currentMood = 'neutral'; #moodBtn = null;
  constructor() { this.#loadMood(); setTimeout(() => this.#initUI(), 1000); }
  #loadMood() { try { const saved = localStorage.getItem('nokhba_mood'); if (saved) this.#currentMood = saved; } catch (e) {} }
  #initUI() {
    if (document.getElementById('moodBtn')) return;
    this.#moodBtn = document.createElement('button'); this.#moodBtn.id = 'moodBtn'; this.#moodBtn.innerHTML = '💓';
    this.#moodBtn.style.cssText = 'position:fixed;bottom:140px;right:20px;width:50px;height:50px;border-radius:50%;background:var(--panel-bg);backdrop-filter:blur(12px);border:1px solid var(--panel-border);color:var(--text);font-size:1.5rem;cursor:pointer;z-index:999;box-shadow:var(--shadow-md);transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;animation:pulseGlow 2s infinite;';
    this.#moodBtn.addEventListener('click', () => this.#openModal());
    document.body.appendChild(this.#moodBtn);
  }
  #openModal() { /* existing mood modal code */ }
  #setMood(mood) { this.#currentMood = mood; localStorage.setItem('nokhba_mood', mood); this.#applyMood(mood); }
  #applyMood(mood) { /* color changes */ }
}

// ================================================================
// 13. UTILITY FUNCTIONS
// ================================================================
export function showToast(message, duration = 3500, icon = '✨') {
  const toast = document.getElementById('toast'); if (!toast) return;
  toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
  toast.classList.add('show'); clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

export function getCart() { try { return JSON.parse(localStorage.getItem('nokhba_cart') || '[]'); } catch { return []; } }
export function saveCart(cart) { localStorage.setItem('nokhba_cart', JSON.stringify(cart)); }
export function getOrders() { try { return JSON.parse(localStorage.getItem('nokhba_orders') || '[]'); } catch { return []; } }
export function saveOrders(orders) { localStorage.setItem('nokhba_orders', JSON.stringify(orders)); }
export function getTheme() { return localStorage.getItem('nokhba_theme') || 'dark'; }
export function setTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('nokhba_theme', theme); }
export function getBackground() { return localStorage.getItem('nokhba_bg_image') || ''; }
export function setBackground(base64) { localStorage.setItem('nokhba_bg_image', base64); applyBackground(base64); }
export function applyBackground(base64) { if (base64?.startsWith('data:image')) document.body.style.setProperty('--bg-image', `url(${base64})`); else document.body.style.setProperty('--bg-image', 'none'); }
export function getFooterImage() { return localStorage.getItem('nokhba_footer_image') || ''; }
export function setFooterImage(base64) { localStorage.setItem('nokhba_footer_image', base64); applyFooterImage(base64); }
export function applyFooterImage(base64) { const footer = document.getElementById('siteFooter'); if (!footer) return; if (base64?.startsWith('data:image')) { footer.style.backgroundImage = `url(${base64})`; footer.style.backgroundSize = 'cover'; footer.style.backgroundPosition = 'center'; footer.style.minHeight = '180px'; } else { footer.style.backgroundImage = 'none'; footer.style.minHeight = '100px'; } }

// ================================================================
// 14. COMMUNITY FUNCTIONS
// ================================================================
export async function updateCommunityStatsOnOrder(orderItems) {
  try { const mgr = new CommunityStatsManager(); let total = 0; orderItems.forEach(i => { if (i.power) total += i.power * i.quantity; }); if (total > 0) await mgr.incrementPower(total); return total; } catch (e) { return 0; }
}
export async function getCommunityStats() { try { return await new CommunityStatsManager().getStats(); } catch { return { totalPower:0, totalCustomers:0, savedHours:0 }; } }
export async function updateEnergyClock() { try { const stats = await getCommunityStats(); const el = document.getElementById('savedHoursDisplay'); if (el) el.textContent = Math.round(stats.savedHours||0); } catch {} }

// ================================================================
// 15. ENERGY MAP (Leaflet)
// ================================================================
let mapInstance = null;
export async function initEnergyMap() {
  try {
    const L = await import('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const container = document.getElementById('energyMap'); if (!container) return;
    document.getElementById('energyMapSection').style.display = 'block';
    mapInstance = L.map('energyMap').setView([12.8, 45.0], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapInstance);
    const stats = await getCommunityStats();
    const areas = [
      { name: 'الشيخ عثمان', lat: 12.82, lng: 44.98, systems: Math.max(8, Math.floor((stats.totalCustomers||0)*0.3)) },
      { name: 'خور مكسر', lat: 12.79, lng: 45.02, systems: Math.max(6, Math.floor((stats.totalCustomers||0)*0.25)) },
      { name: 'كريتر', lat: 12.77, lng: 45.04, systems: Math.max(4, Math.floor((stats.totalCustomers||0)*0.2)) },
      { name: 'المعلا', lat: 12.75, lng: 44.99, systems: Math.max(3, Math.floor((stats.totalCustomers||0)*0.15)) },
      { name: 'التواهي', lat: 12.78, lng: 44.96, systems: Math.max(2, Math.floor((stats.totalCustomers||0)*0.1)) }
    ];
    areas.forEach(a => { const m = L.circleMarker([a.lat, a.lng], { radius: Math.min(8 + (a.systems/(stats.totalCustomers||1))*20, 30), fillColor:'#d97706', fillOpacity:0.7, color:'#fff', weight:1 }).addTo(mapInstance); m.bindPopup(`<strong>${a.name}</strong><br>⚡ ${a.systems} نظام شمسي`); });
  } catch (e) { console.warn('خريطة الطاقة:', e); }
}

// ================================================================
// 16. ENGINEERING CHALLENGE
// ================================================================
export function initEngineeringChallenge() {
  const btn = document.getElementById('submitChallengeBtn'); if (!btn) return;
  btn.addEventListener('click', () => {
    const name = document.getElementById('engineerName')?.value.trim();
    const desc = document.getElementById('designDesc')?.value.trim();
    if (!name || !desc) { showToast('⚠️ يرجى ملء جميع الحقول', 2000, '⚠️'); return; }
    const entries = JSON.parse(localStorage.getItem('nokhba_challenges')||'[]');
    entries.push({ name, desc, date: new Date().toISOString() });
    localStorage.setItem('nokhba_challenges', JSON.stringify(entries));
    showToast('✅ تم تقديم التصميم', 3000, '✅');
    updatePastWinners();
  });
}
export function updatePastWinners() {
  const entries = JSON.parse(localStorage.getItem('nokhba_challenges')||'[]');
  const el = document.getElementById('pastWinners'); if (!el) return;
  if (!entries.length) { el.textContent = '🏅 لا يوجد مشاركات بعد.'; return; }
  el.textContent = '🏅 أحدث المشاركين: ' + entries.slice(-3).map(e=>e.name).join('، ');
}

// ================================================================
// 17. INSTALLATION SERVICE
// ================================================================
export function addInstallationToCart(productId) {
  new ProductManager().getById(productId).then(p => {
    if (!p) return;
    const installCost = p.price * 0.15;
    const installItem = { ...p, id: p.id+'_install', name: p.name+' (خدمة تركيب)', price: installCost, isInstallation: true, quantity:1, stock:999 };
    const cart = getCart(); cart.push(installItem); saveCart(cart);
    if (typeof updateCartUI === 'function') updateCartUI();
    showToast('🛠️ تم إضافة خدمة التركيب', 2500, '🛠️');
  });
}

console.log('⚡ النخبة – النواة الهندسية v9.0 جاهزة');
