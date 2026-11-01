// Contracts reuse the existing crop economy and production recipes.
export const CONTRACTS = [
  { id: 'pantry', client: 'Koperasi Desa', title: 'Pasokan dapur', item: 'wheat', quantity: 8, level: 1, premium: 0.25, skill: 'Perencanaan persediaan' },
  { id: 'market', client: 'Pasar Pagi', title: 'Panen untuk pasar', item: 'wheat', quantity: 14, level: 1, premium: 0.30, skill: 'Alokasi kapasitas' },
  { id: 'canteen', client: 'Kantin Kebun', title: 'Menu kentang', item: 'potato', quantity: 10, level: 2, premium: 0.30, skill: 'Diversifikasi produksi' },
  { id: 'bakery', client: 'Toko Roti', title: 'Tepung langganan', item: 'flour', quantity: 6, level: 3, zone: 'zone2', premium: 0.35, skill: 'Menyeimbangkan lini produksi' },
  { id: 'bread', client: 'Kafe Senja', title: 'Roti untuk kafe', item: 'bread', quantity: 4, level: 3, zone: 'zone2', premium: 0.35, skill: 'Mengelola rantai pasok' },
  { id: 'orchard', client: 'Kios Buah', title: 'Apel segar', item: 'apple_tree', quantity: 10, level: 4, premium: 0.30, skill: 'Investasi jangka panjang' },
  { id: 'metal', client: 'Bengkel Desa', title: 'Persediaan besi', item: 'iron_ingot', quantity: 5, level: 5, zone: 'zone3', premium: 0.35, skill: 'Mengelola bahan baku bersama' },
  { id: 'wire', client: 'Lab Komunitas', title: 'Jaringan baru', item: 'wire', quantity: 9, level: 8, zone: 'zone4', premium: 0.35, skill: 'Prioritas produk bernilai tambah' },
];
