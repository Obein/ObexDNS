/**
 * BloomFilter.ts - 高性能布隆过滤器实现
 * 
 * 针对 P = 10^-6 精度场景进行高度优化。
 * 在该精度下，对于每个元素，k ≈ 20 (哈希函数数量)。
 * 优化重点：使用 32位位数组 (Uint32Array) 代替 8位 (Uint8Array)，
 * 减少 4 倍的合并 (merge) 循环开销，以及加速位偏移计算。
 */
export class BloomFilter {
  private readonly size: number;
  private readonly hashes: number;
  private readonly bitArray: Uint32Array;

  private static readonly FNV_PRIME = 16777619;
  private static readonly FNV_SEED_0 = 2166136261;
  private static readonly FNV_SEED_1 = 3074159265;
  
  // 预分配 TextEncoder 以避免重复创建开销 (Isolate 全局)
  private static readonly encoder = new TextEncoder();

  /**
   * 构造函数
   * @param size 位数组长度 (bits)
   * @param hashes 哈希函数个数 (k)
   * @param bitArray 现有的二进制位数据 (32位数组)
   */
  constructor(size: number, hashes: number, bitArray?: Uint32Array) {
    this.size = size >>> 0;
    this.hashes = hashes >>> 0;
    // 计算需要的 32位字 (words) 的数量
    const words = ((this.size + 31) >>> 5);
    this.bitArray = bitArray || new Uint32Array(words);
  }

  /**
   * 初始化布隆过滤器
   * @param expectedItems 预期存储的条目数 (n)
   * @param errorRate 假阳性率 (p)，默认 10^-4 (0.0001)
   */
  static create(expectedItems: number, errorRate: number = 0.0001): BloomFilter {
    const n = Math.max(expectedItems, 100);
    const p = errorRate;
    
    // 公式: m = -(n * ln(p)) / (ln(2)^2)
    const m = Math.ceil(-(n * Math.log(p)) / (Math.log(2) ** 2));
    // 公式: k = (m / n) * ln(2)
    const k = Math.round((m / n) * Math.log(2));
    
    return new BloomFilter(m, k);
  }

  /**
   * 添加元素
   * @param element 字符串元素
   */
  add(element: string): void {
    let h1 = BloomFilter.FNV_SEED_0;
    let h2 = BloomFilter.FNV_SEED_1;
    const len = element.length;
    for (let i = 0; i < len; i++) {
      const char = element.charCodeAt(i) & 0xff;
      h1 ^= char;
      h1 = Math.imul(h1, BloomFilter.FNV_PRIME);
      h2 ^= char;
      h2 = Math.imul(h2, BloomFilter.FNV_PRIME);
    }
    h1 = h1 >>> 0;
    h2 = h2 >>> 0;

    for (let i = 0; i < this.hashes; i++) {
      // Double Hashing: (h1 + i * h2) % m
      const pos = (h1 + i * h2) % this.size;
      // 32位数组优化: index / 32 => pos >>> 5, index % 32 => pos & 31
      this.bitArray[pos >>> 5] |= (1 << (pos & 31));
    }
  }

  /**
   * 检测元素是否存在 (无假阴性，有极低假阳性)
   * @param element 待检测字符串
   */
  test(element: string): boolean {
    let h1 = BloomFilter.FNV_SEED_0;
    let h2 = BloomFilter.FNV_SEED_1;
    const len = element.length;
    for (let i = 0; i < len; i++) {
      const char = element.charCodeAt(i) & 0xff;
      h1 ^= char;
      h1 = Math.imul(h1, BloomFilter.FNV_PRIME);
      h2 ^= char;
      h2 = Math.imul(h2, BloomFilter.FNV_PRIME);
    }
    h1 = h1 >>> 0;
    h2 = h2 >>> 0;

    for (let i = 0; i < this.hashes; i++) {
      const pos = (h1 + i * h2) % this.size;
      if ((this.bitArray[pos >>> 5] & (1 << (pos & 31))) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * 导出为原始二进制格式 (用于 R2 / D1 存储，避开 Base64 开销)
   * 结构: [4字节 size][4字节 hashes][位数组]
   */
  toUint8Array(): Uint8Array {
    const res = new Uint8Array(8 + this.bitArray.byteLength);
    const view = new DataView(res.buffer);
    view.setUint32(0, this.size, true); // 小端序存储
    view.setUint32(4, this.hashes, true);
    
    // 拷贝 underlying byte data 到目标 Uint8Array
    res.set(new Uint8Array(this.bitArray.buffer, this.bitArray.byteOffset, this.bitArray.byteLength), 8);
    return res;
  }

  /**
   * 从原始二进制流恢复 (零拷贝/对齐安全反序列化)
   */
  static fromUint8Array(buffer: Uint8Array): BloomFilter {
    const view = new DataView(buffer.buffer, buffer.byteOffset, 8);
    const size = view.getUint32(0, true);
    const hashes = view.getUint32(4, true);
    
    const offset = buffer.byteOffset + 8;
    const length = buffer.byteLength - 8;
    
    let bitData: Uint32Array;
    // 确保 offset 是 4 的倍数，否则 Uint32Array 构建会抛出异常
    if (offset % 4 === 0) {
      bitData = new Uint32Array(buffer.buffer, offset, length >> 2);
    } else {
      // 非 4 字节对齐时，执行拷贝到对齐的 ArrayBuffer 内存中
      const copy = new Uint8Array(length);
      copy.set(buffer.subarray(8));
      bitData = new Uint32Array(copy.buffer, 0, length >> 2);
    }
    return new BloomFilter(size, hashes, bitData);
  }

  /**
   * 合并另一个布隆过滤器 (按位或运算)
   * 由于 bitArray 采用了 Uint32Array，此处的循环开销减少了 4 倍！
   */
  merge(other: BloomFilter): void {
    if (this.size !== other.size || this.hashes !== other.hashes) {
      throw new Error("Cannot merge bloom filters with different sizes or hash counts.");
    }
    const len = this.bitArray.length;
    for (let i = 0; i < len; i++) {
      this.bitArray[i] |= other.bitArray[i];
    }
  }

  /**
   * 基础 FNV-1a 哈希实现，操作 Uint8Array 以获得最佳性能
   */
  private fnv1a(data: Uint8Array, seed: number): number {
    let hash = seed >>> 0;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, BloomFilter.FNV_PRIME);
    }
    return hash >>> 0;
  }

  /**
   * 基础 FNV-1a 哈希实现，直接操作 string 字符以避免内存分配和 TextEncoder 性能开销
   */
  private fnv1aString(str: string, seed: number): number {
    let hash = seed >>> 0;
    const len = str.length;
    for (let i = 0; i < len; i++) {
      hash ^= str.charCodeAt(i) & 0xff;
      hash = Math.imul(hash, BloomFilter.FNV_PRIME);
    }
    return hash >>> 0;
  }

  /**
   * 传统 Base64 兼容导出逻辑
   */
  dump(): { size: number; hashes: number; data: string } {
    const bytes = new Uint8Array(this.bitArray.buffer, this.bitArray.byteOffset, this.bitArray.byteLength);
    let binary = '';
    const len = bytes.byteLength;
    const chunk = 0x8000;
    for (let i = 0; i < len; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)) as any);
    }
    return { size: this.size, hashes: this.hashes, data: btoa(binary) };
  }

  /**
   * 传统 Base64 兼容加载逻辑
   */
  static load(dump: { size: number; hashes: number; data: string }): BloomFilter {
    const binary = atob(dump.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // 拷贝并填充到对齐的 Uint32Array 缓冲区
    const words = (bytes.length + 3) >> 2;
    const bitData = new Uint32Array(words);
    new Uint8Array(bitData.buffer).set(bytes);
    return new BloomFilter(dump.size, dump.hashes, bitData);
  }
}
