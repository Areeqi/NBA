// ================================================================
// main.js – النواة الأسطورية لمتجر النخبة (Enterprise Edition)
// الإصدار النهائي المتكامل – v6.0 (تكامل Firebase الحقيقي + تحسينات الأداء)
// ================================================================

import * as THREE from 'three';

// ================================================================
// 1. FIREBASE INTEGRATION – إعدادات وتكامل سحابة فايربيس
// ================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, get, child, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyAnkES6TCMGdshbJmocM_0avknOcdbJ4Ms",
  authDomain: "nokhba-store.firebaseapp.com",
  databaseURL: "https://nokhba-store-default-rtdb.firebaseio.com",
  projectId: "nokhba-store",
  storageBucket: "nokhba-store.firebasestorage.app",
  messagingSenderId: "701367541618",
  appId: "1:701367541618:web:65d0414bb58e5a88f9c7eb",
  measurementId: "G-KQD833WKNB"
};

// تهيئة تطبيق Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
export const storage = getStorage(app);

// ================================================================
// 2. STORAGE ADAPTERS – طبقة تجريد التخزين
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
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, key));
      if (snapshot.exists()) {
        return snapshot.val();
      } else {
        return null;
      }
    } catch (error) {
      console.error('خطأ في جلب البيانات من Firebase:', error);
      return null; // سيتم استخدام البيانات الافتراضية إذا فشل الاتصال
    }
  }

  async set(key, value) {
    try {
      await set(ref(db, key), value);
    } catch (error) {
      console.error('خطأ في حفظ البيانات إلى Firebase:', error);
      throw error;
    }
  }

  async remove(key) {
    try {
      await remove(ref(db, key));
    } catch (error) {
      console.error('خطأ في حذف البيانات من Firebase:', error);
      throw error;
    }
  }

  async clear() {
    console.warn('تحذير: تم تعطيل مسح قاعدة البيانات بالكامل لحماية البيانات عبر Firebase');
  }
}

// ================================================================
// 3. PRODUCT MANAGER – إدارة المنتجات المتطورة
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

  // استخدام Firebase Adapter كافتراضي
  constructor(adapter = new FirebaseAdapter()) {
    this.#adapter = adapter;
  }

  async #load() {
    if (this.#cache) return this.#cache;
    const data = await this.#adapter.get('nokhba_products');
    
    // منتج افتراضي يُستخدم في حال كانت قاعدة البيانات جديدة/فارغة
    const defaults = [
      {
        id: 'p1', name: 'منتج تجريبي 1', category: 'مفاتيح', price: 45, stock: 100, minOrder: 1, rating: 4.5,
        isNew: true, isBestSeller: false, active: true, sortOrder: 1,
        image: '/public/images/products/10.00 SAR.jpg', images: ['/public/images/products/10.00 SAR.jpg'],
        desc: 'هذا منتج افتراضي للتجربة.', variants: []
      }
    ];
    
    this.#cache = (data && data.length) ? data : defaults;
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
      const key = sort;
      products.sort((a, b) => (a[key] > b[key]) ? 1 : -1);
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
          // استخدام توليد معرفات عشوائية يمنع التصادم 
          id: 'id_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
          ...command.payload,
          createdAt: new Date().toISOString()
        };
        if (!np.variants) np.variants = [];
        products.push(np);
        result = np;
        break;
      }
      case 'UPDATE': {
        const idx = products.findIndex(p => p.id === command.payload.id);
        if (idx === -1) throw new Error('المنتج غير موجود');
        products[idx] = { ...products[idx], ...command.payload };
        if (!products[idx].variants) products[idx].variants = [];
        result = products[idx];
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
// 4. BLOG MANAGER – إدارة المدونة
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
    const defaults = [
      {
        id: 'b1', title: 'أحدث تقنيات الطاقة الشمسية في اليمن', slug: 'احدث-تقنيات-الطاقة-الشمسية',
        excerpt: 'نستعرض في هذا المقال أحدث التطورات في مجال الطاقة الشمسية.',
        content: '<p>تفاصيل المقال الكامل...</p>', image: '/public/images/blog/solar-tech.jpg',
        date: new Date().toISOString(), author: 'فريق النخبة', tags: ['طاقة شمسية', 'تقنية'], published: true
      }
    ];
    this.#cache = (data && data.length) ? data : defaults;
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

  async getBySlug(slug) {
    const posts = await this.#load();
    return posts.find(p => p.slug === slug && p.published !== false) || null;
  }

  async mutate(command) {
    let posts = await this.#load();
    let result;
    switch (command.type) {
      case 'ADD': {
        const np = {
          id: 'b' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
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
      default:
        throw new Error('أمر غير معروف');
    }
    await this.#adapter.set('nokhba_blog_posts', posts);
    this.#cache = null;
    return result;
  }

  async getRecent(limit = 3) {
    const posts = await this.getAll();
    return posts.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
  }
}

// ================================================================
// 5. CONTACT MANAGER – إدارة معلومات التواصل
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
      email: 'info@nokhba-electric.com',
      whatsapp: '967782826727',
      facebook: 'https://facebook.com/nokhba',
      instagram: 'https://instagram.com/nokhba',
      twitter: 'https://twitter.com/nokhba',
      youtube: 'https://youtube.com/nokhba',
      mapEmbed: '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.123456!2d45.123456!3d12.123456!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDA3JzI0LjYiTiA0NcKwMDcnMjQuMCJF!5e0!3m2!1sar!2sye!4v1234567890" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy"></iframe>',
      openingHours: 'السبت - الخميس: 9:00 ص - 9:00 م'
    };
    this.#cache = data || defaults;
    return this.#cache;
  }

  async get() {
    return this.#load();
  }

  async update(data) {
    const current = await this.#load();
    const updated = { ...current, ...data };
    await this.#adapter.set('nokhba_contact_info', updated);
    this.#cache = null;
    return updated;
  }

  async reset() {
    const defaults = {
      address: 'عدن، جولة عبد القوي فكة كونكورد – مقابل ثلاجة بلعيد',
      phone: '+967782826727',
      email: 'info@nokhba-electric.com',
      whatsapp: '967782826727'
    };
    await this.#adapter.set('nokhba_contact_info', defaults);
    this.#cache = null;
    return defaults;
  }
}

// ================================================================
// 6. LIGHTNING ENGINE – محرك البرق ثلاثي الأبعاد (مُحسّن الأداء)
// ================================================================

export class LightningEngine {
  #scene;
  #camera;
  #renderer;
  #clock = new THREE.Clock();
  #bolts = [];
  #container = null;
  #isAnimating = false; // تتبع حالة التحريك لتوفير الـ GPU

  init(container) {
    this.#container = container;
    this.#scene = new THREE.Scene();
    this.#camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.#camera.position.z = 1;

    this.#renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.#renderer.setSize(container.clientWidth, container.clientHeight);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setClearColor(0x000000, 0);
    container.appendChild(this.#renderer.domElement);

    // تقديم الإطار الأول فقط للتأكد من نظافة الـ Canvas
    this.#renderer.render(this.#scene, this.#camera);

    window.addEventListener('resize', () => {
      this.#renderer.setSize(this.#container.clientWidth, this.#container.clientHeight);
      if (!this.#isAnimating) this.#renderer.render(this.#scene, this.#camera);
    });
  }

  spawn(x, y, intensity = 1) {
    const nx = (x / window.innerWidth) * 2 - 1;
    const ny = -(y / window.innerHeight) * 2 + 1;

    const segments = 18 + Math.floor(Math.random() * 8);
    const pts = [{ x: nx, y: ny }];
    let cx = nx, cy = ny;
    for (let i = 0; i < segments; i++) {
      cx += (Math.random() - 0.5) * 0.22;
      cy -= 0.04 + Math.random() * 0.04;
      pts.push({ x: cx, y: cy });
    }

    const mainGeom = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(p.x, p.y, 0))
    );
    const mainMat = new THREE.LineBasicMaterial({
      color: 0xc0d0ff,
      transparent: true,
      opacity: 0.9
    });
    const mainLine = new THREE.Line(mainGeom, mainMat);
    this.#scene.add(mainLine);

    const glowMat = new THREE.LineBasicMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0.5
    });
    const glowLine = new THREE.Line(mainGeom, glowMat);
    this.#scene.add(glowLine);

    const branches = [];
    const branchIndices = [
      Math.floor(pts.length * 0.3),
      Math.floor(pts.length * 0.65)
    ];
    branchIndices.forEach((idx, dirSign) => {
      const bp = [{ x: pts[idx].x, y: pts[idx].y }];
      let bx = bp[0].x, by = bp[0].y;
      const d = (dirSign === 0 ? 1 : -1) * (0.12 + Math.random() * 0.06);
      for (let i = 0; i < 6; i++) {
        bx += d + (Math.random() - 0.5) * 0.08;
        by -= 0.035;
        bp.push({ x: bx, y: by });
      }
      const bGeom = new THREE.BufferGeometry().setFromPoints(
        bp.map(p => new THREE.Vector3(p.x, p.y, 0))
      );
      const bMat = new THREE.LineBasicMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.35
      });
      const bLine = new THREE.Line(bGeom, bMat);
      this.#scene.add(bLine);
      branches.push(bLine);
    });

    const sparkCount = 60 + Math.floor(Math.random() * 40);
    const pos = [];
    for (let i = 0; i < sparkCount; i++) {
      const idx = Math.floor(Math.random() * pts.length);
      pos.push(pts[idx].x + (Math.random() - 0.5) * 0.18);
      pos.push(pts[idx].y + (Math.random() - 0.5) * 0.18);
      pos.push((Math.random() - 0.5) * 0.06);
    }
    const sGeom = new THREE.BufferGeometry();
    sGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const sMat = new THREE.PointsMaterial({
      color: 0xffdd88,
      size: 0.028,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const sparks = new THREE.Points(sGeom, sMat);
    this.#scene.add(sparks);

    this.#bolts.push({
      line: mainLine,
      glow: glowLine,
      branches,
      sparks,
      life: 0.45 + Math.random() * 0.15,
      age: 0
    });

    // استئناف حلقة التحريك إذا كانت متوقفة (أداء عبقري)
    if (!this.#isAnimating) {
      this.#isAnimating = true;
      this.#clock.getDelta(); // تصفير الساعة لمنع القفزات الزمنية
      this.#animate();
    }
  }

  #animate = () => {
    // إيقاف الـ GPU عن العمل إذا لم تكن هناك خطوط برق نشطة
    if (this.#bolts.length === 0) {
      this.#isAnimating = false;
      this.#renderer.render(this.#scene, this.#camera);
      return; 
    }

    requestAnimationFrame(this.#animate);
    const delta = Math.min(this.#clock.getDelta(), 0.05);

    for (let i = this.#bolts.length - 1; i >= 0; i--) {
      const b = this.#bolts[i];
      b.age += delta;
      if (b.age > b.life) {
        this.#scene.remove(b.line);
        this.#scene.remove(b.glow);
        b.branches.forEach(br => this.#scene.remove(br));
        this.#scene.remove(b.sparks);
        b.line.geometry.dispose && b.line.geometry.dispose();
        b.glow.geometry.dispose && b.glow.geometry.dispose();
        b.branches.forEach(br => br.geometry.dispose && br.geometry.dispose());
        b.sparks.geometry.dispose && b.sparks.geometry.dispose();
        this.#bolts.splice(i, 1);
      } else {
        const alpha = 1 - b.age / b.life;
        b.line.material.opacity = alpha * 0.9;
        b.glow.material.opacity = alpha * 0.5;
        b.branches.forEach(br => br.material.opacity = alpha * 0.35);
        b.sparks.material.size = 0.028 * alpha;
        b.sparks.material.opacity = alpha * 0.9;
      }
    }
    this.#renderer.render(this.#scene, this.#camera);
  };
}

// ================================================================
// 7. THUNDER ENGINE – محرك الصوت (الرعد) - مُحصن ضد سياسات المتصفح
// ================================================================

export class ThunderEngine {
  #audio = null;
  #ready = false;
  #initAttempts = 0;
  #maxInitAttempts = 3;

  constructor() {
    this.init();
  }

  init() {
    if (this.#initAttempts >= this.#maxInitAttempts) return;
    this.#initAttempts++;

    try {
      this.#audio = new Audio('/public/sounds/thunder.mp3');
      this.#audio.preload = 'auto';
      this.#audio.volume = 0.7;
      this.#audio.loop = false;

      this.#audio.oncanplaythrough = () => { this.#ready = true; };
      this.#audio.onloadeddata = () => { this.#ready = true; };
      this.#audio.onerror = (e) => {
        this.#ready = false;
        setTimeout(() => {
          if (this.#initAttempts < this.#maxInitAttempts) this.init();
        }, 2000);
      };

      this.#audio.load();

      // فك قفل تشغيل الصوت برمجياً (Autoplay Policy Unlocker)
      // بمجرد ضغط المستخدم على أي مكان في الشاشة، نقوم بتحميل الصوت لضمان سماح المتصفح
      const unlockAudio = () => {
        if (this.#audio && !this.#ready) {
          this.#audio.load();
        }
        document.removeEventListener('click', unlockAudio);
      };
      document.addEventListener('click', unlockAudio);

    } catch (err) {
      this.#ready = false;
    }
  }

  play(intensity = 1) {
    if (!this.#ready || !this.#audio) {
      this.init();
      setTimeout(() => {
        if (this.#ready && this.#audio) this._playInternal(intensity);
      }, 500);
      return false;
    }
    return this._playInternal(intensity);
  }

  _playInternal(intensity) {
    try {
      this.#audio.currentTime = 0;
      const volume = Math.min(1, Math.max(0.2, 0.3 + intensity * 0.5));
      this.#audio.volume = volume;

      const playPromise = this.#audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
            this.#audio.load();
            setTimeout(() => { this.#audio.play().catch(() => {}); }, 300);
          });
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  isReady() {
    return this.#ready && this.#audio !== null;
  }

  reload() {
    this.#initAttempts = 0;
    this.#ready = false;
    this.init();
  }
}

// ================================================================
// 8. UTILITY FUNCTIONS – دوال مساعدة للمتجر
// ================================================================

// رفع الصورة بصيغة Base64 إلى Firebase Storage وإرجاع الرابط النظيف (URL)
export async function uploadImageToStorage(base64String, path) {
  if (!base64String || !base64String.startsWith('data:image')) {
    return base64String;
  }
  
  try {
    const fileName = `image_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
    const fullPath = `${path}/${fileName}`;
    const imgRef = storageRef(storage, fullPath);
    
    await uploadString(imgRef, base64String, 'data_url');
    const downloadURL = await getDownloadURL(imgRef);
    return downloadURL;
  } catch (error) {
    console.error('خطأ في رفع الصورة إلى Storage:', error);
    throw error;
  }
}

export function showToast(message, duration = 3500, icon = '✨') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

export function getCart() {
  try { return JSON.parse(localStorage.getItem('nokhba_cart') || '[]'); } 
  catch { return []; }
}

export function saveCart(cart) {
  localStorage.setItem('nokhba_cart', JSON.stringify(cart));
}

export function getOrders() {
  try { return JSON.parse(localStorage.getItem('nokhba_orders') || '[]'); } 
  catch { return []; }
}

export function saveOrders(orders) {
  localStorage.setItem('nokhba_orders', JSON.stringify(orders));
}

export function getTheme() {
  return localStorage.getItem('nokhba_theme') || 'light';
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nokhba_theme', theme);
}

export function getBackground() {
  return localStorage.getItem('nokhba_bg_image') || '';
}

export function setBackground(url) {
  localStorage.setItem('nokhba_bg_image', url);
  applyBackground(url);
}

export function applyBackground(url) {
  if (url && (url.startsWith('http') || url.startsWith('data:image'))) {
    document.body.style.setProperty('--bg-image', `url(${url})`);
  } else {
    document.body.style.setProperty('--bg-image', 'none');
  }
}

export function getFooterImage() {
  return localStorage.getItem('nokhba_footer_image') || '';
}

export function setFooterImage(url) {
  localStorage.setItem('nokhba_footer_image', url);
  applyFooterImage(url);
}

export function applyFooterImage(url) {
  const footer = document.getElementById('siteFooter');
  if (!footer) return;
  if (url && (url.startsWith('http') || url.startsWith('data:image'))) {
    footer.style.backgroundImage = `url(${url})`;
    footer.style.backgroundSize = 'cover';
    footer.style.backgroundPosition = 'center';
    footer.style.minHeight = '180px';
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'center';
    footer.style.position = 'relative';
    footer.style.marginTop = '2rem';
    footer.style.borderRadius = 'var(--radius-lg)';
    footer.style.overflow = 'hidden';
  } else {
    footer.style.backgroundImage = 'none';
    footer.style.minHeight = '100px';
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'center';
    footer.style.flexDirection = 'column';
  }
}

// ================================================================
// 9. دوال مساعدة للمقاسات (Variants)
// ================================================================

export function getVariantPrice(product, variantSize) {
  if (!product.variants || product.variants.length === 0) return product.price;
  const variant = product.variants.find(v => v.size === variantSize);
  return variant ? variant.price : product.price;
}

export function getVariantStock(product, variantSize) {
  if (!product.variants || product.variants.length === 0) return product.stock;
  const variant = product.variants.find(v => v.size === variantSize);
  return variant ? variant.stock : 0;
}

export function getVariantMinOrder(product, variantSize) {
  if (!product.variants || product.variants.length === 0) return product.minOrder || 1;
  const variant = product.variants.find(v => v.size === variantSize);
  return variant ? variant.minOrder : 1;
}

export function getAvailableSizes(product) {
  if (!product.variants || product.variants.length === 0) return [];
  return product.variants.map(v => v.size);
}

// ================================================================
// 10. منع التصادم مع Three.js
// ================================================================

if (typeof THREE !== 'undefined' && !window.__THREE_LOADED) {
  window.__THREE_LOADED = true;
}

console.log('⚡ النخبة – النواة الأسطورية (Enterprise) جاهزة بكامل ميزاتها مع Firebase!');
