import { StageId, StageSpec } from './types';

export const STAGES: Record<StageId, StageSpec> = {
  living_room: {
    id: 'living_room',
    name: 'RUANG TAMU & TERAS',
    subtitle: 'Lantai Keramik 3D · Sofa & Rak TV · Pagar Teras',
  },
  dojo: {
    id: 'dojo',
    name: 'DOJO TRADISIONAL',
    subtitle: 'Papan Kayu 3D · Pilar · Pintu Shoji',
  },
  park: {
    id: 'park',
    name: 'TAMAN BERMAIN KOTA',
    subtitle: 'Paving 3D · Perosotan & Ayunan · Siluet Kota',
  },
  kitchen: {
    id: 'kitchen',
    name: 'DAPUR & MEJA MAKAN',
    subtitle: 'Ubin Dapur 3D · Kulkas & Kabinet · Meja Bar',
  },
  rooftop: {
    id: 'rooftop',
    name: 'ATAP GEDUNG KOTA',
    subtitle: 'Dek Beton 3D · Tangki Air & Antena · Panorama',
  },
  library: {
    id: 'library',
    name: 'PERPUSTAKAAN KELUARGA',
    subtitle: 'Lantai Parket 3D · Rak Buku Tinggi · Jendela',
  },
  simpang_lima_gumul: {
    id: 'simpang_lima_gumul',
    name: 'SIMPANG LIMA GUMUL',
    subtitle: 'Pelataran Monumen 3D · Pelengkung & Relief · Kediri',
  },
  jembatan_brawijaya: {
    id: 'jembatan_brawijaya',
    name: 'JEMBATAN BRAWIJAYA',
    subtitle: 'Jalan Aspal 3D · Gerbang Kota Kediri · Sungai Brantas',
  },
};

export const STAGE_ORDER: StageId[] = [
  'living_room',
  'dojo',
  'park',
  'kitchen',
  'rooftop',
  'library',
  'simpang_lima_gumul',
  'jembatan_brawijaya',
];
