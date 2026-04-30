/* =====================================================
   ENERGISCAN — SCRIPT UTAMA
   Semua logika interaktif ada di sini: kalkulasi,
   navigasi, render canvas vektor, tips hemat, dll.
====================================================== */


/* =====================================================
   VARIABEL GLOBAL
   Disimpan di luar fungsi biar bisa diakses semua
   fungsi tanpa harus dioper-oper terus lewat parameter.
====================================================== */
let currentTarif = 0;    // tarif Rp/kWh sesuai golongan VA yang dipilih
let currentVA    = 0;    // batas daya VA rumah (untuk cek status overload)
let myChart      = null; // simpan referensi chart biar bisa di-destroy sebelum dibuat ulang
let lastResults  = [];   // array hasil kalkulasi: [{nama, watt, jam, kwh}, ...]


/* =====================================================
   DATA PRESET ALAT RUMAH
   Daftar alat + estimasi watt-nya. Ini yang jadi
   sumber tombol-tombol preset di halaman input.
   Kalau mau tambah alat baru, tinggal tambah di sini.
====================================================== */
const PRESETS = [
  { nama: "Lampu LED",    watt: 10  },
  { nama: "Kipas Angin",  watt: 50  },
  { nama: "TV LED",       watt: 80  },
  { nama: "Laptop",       watt: 65  },
  { nama: "Kulkas",       watt: 120 },
  { nama: "Pompa Air",    watt: 250 },
  { nama: "Rice Cooker",  watt: 300 },
  { nama: "Setrika",      watt: 350 },
  { nama: "Mesin Cuci",   watt: 400 },
  { nama: "AC 1 PK",      watt: 800 },
];


/* =====================================================
   DATABASE TIPS KONTEKSTUAL
   Tips di sini hanya ditampilkan kalau alat yang
   relevan ada di list user. Caranya: cocokkan nama
   alat yang diinput user dengan keywords di tiap entry.
   Kalau tidak ada yang cocok, pakai TIPS_UMUM sebagai fallback.
====================================================== */
const TIPS_KONTEKSTUAL = [
  { keywords: ['ac', 'air conditioner', 'pendingin'],
    tips: [
      "Atur suhu AC di 24–26°C. Setiap 1°C lebih dingin menambah konsumsi sekitar 6%.",
      "Bersihkan filter AC setiap 2 minggu — filter kotor bisa menambah konsumsi daya hingga 15%.",
      "Gunakan timer AC agar tidak menyala sepanjang malam tanpa perlu.",
    ]},
  { keywords: ['kulkas', 'lemari es'],
    tips: [
      "Jaga kulkas terisi 70–80% — terlalu kosong atau penuh membuatnya bekerja ekstra.",
      "Jangan taruh makanan panas langsung ke kulkas — tunggu dingin dulu.",
    ]},
  { keywords: ['setrika'],
    tips: [
      "Setrika baju sekaligus dalam satu sesi — memanaskan setrika berkali-kali justru boros.",
    ]},
  { keywords: ['mesin cuci', 'laundry', 'cuci'],
    tips: [
      "Gunakan mesin cuci saat kapasitas penuh — satu cucian penuh lebih hemat dari dua setengah.",
    ]},
  { keywords: ['tv', 'televisi', 'monitor'],
    tips: [
      "Matikan TV saat tidak ditonton — mode standby tetap memakai daya.",
    ]},
  { keywords: ['lampu', 'led'],
    tips: [
      "Manfaatkan cahaya alami di siang hari dan matikan lampu yang tidak digunakan.",
    ]},
  { keywords: ['laptop', 'pc', 'komputer', 'desktop'],
    tips: [
      "Aktifkan mode sleep saat tidak digunakan lebih dari 10 menit.",
    ]},
  { keywords: ['pompa', 'air'],
    tips: [
      "Gunakan tandon air agar pompa tidak harus menyala setiap kali ada yang pakai air.",
    ]},
  { keywords: ['rice cooker', 'magic com', 'penanak'],
    tips: [
      "Pindahkan nasi ke wadah termos setelah matang — mode warm terus menarik daya.",
    ]},
  { keywords: ['kipas', 'fan'],
    tips: [
      "Kombinasikan kipas + AC suhu lebih tinggi — jauh lebih hemat dari AC dingin sendirian.",
    ]},
];

/* Tips cadangan kalau tidak ada alat yang cocok dengan keywords di atas */
const TIPS_UMUM = [
  "Cabut charger dan adaptor saat tidak digunakan — standby power bisa menyedot hingga 10% tagihan.",
  "Gunakan stopkontak bersaklar agar mudah memutus daya beberapa perangkat sekaligus.",
  "Cek label hemat energi saat beli alat baru — pilih rating bintang lebih tinggi.",
];


/* =====================================================
   DATABASE ALAT BERAT & KOMBINASI BERBAHAYA
   ALAT_BERAT: daftar alat yang daya-nya besar,
   lengkap dengan keyword pengenal dan id unik.

   KOMBINASI_BAHAYA: pasangan alat yang tidak disarankan
   dipakai bersamaan karena bisa trip MCB.
   Level "merah" lebih serius dari "kuning".
====================================================== */
const ALAT_BERAT = [
  { id: 'ac',       keywords: ['ac ',  'air conditioner', 'pendingin'],        label: 'AC'            },
  { id: 'setrika',  keywords: ['setrika'],                                      label: 'Setrika'       },
  { id: 'cuci',     keywords: ['mesin cuci', 'laundry'],                        label: 'Mesin Cuci'    },
  { id: 'pompa',    keywords: ['pompa'],                                         label: 'Pompa Air'     },
  { id: 'ricecook', keywords: ['rice cooker', 'magic com', 'penanak'],           label: 'Rice Cooker'   },
  { id: 'water',    keywords: ['water heater', 'pemanas air'],                   label: 'Water Heater'  },
  { id: 'kompor',   keywords: ['kompor listrik', 'induction', 'induksi'],        label: 'Kompor Listrik'},
];

const KOMBINASI_BAHAYA = [
  { combo: ['ac', 'setrika'], level: 'merah',
    judul: '⚠️ Kombinasi Risiko Tinggi',
    pesan: 'AC dan setrika keduanya berdaya besar. Hindari menyalakan bersamaan — MCB bisa trip.' },
  { combo: ['ac', 'cuci'], level: 'kuning',
    judul: '⚡ Perhatikan Beban Daya',
    pesan: 'AC dan mesin cuci bersamaan cukup membebani MCB. Gunakan bergantian.' },
  { combo: ['setrika', 'cuci'], level: 'kuning',
    judul: '⚡ Perhatikan Beban Daya',
    pesan: 'Setrika dan mesin cuci sama-sama berdaya besar. Gunakan bergantian.' },
  { combo: ['ac', 'water'], level: 'kuning',
    judul: '⚡ Perhatikan Beban Daya',
    pesan: 'AC dan water heater bersamaan cukup berat. Matikan salah satu saat lainnya menyala.' },
  { combo: ['setrika', 'ricecook'], level: 'kuning',
    judul: '⚡ Jadwalkan Penggunaan',
    pesan: 'Setrika dan rice cooker sebaiknya tidak bersamaan. Tunggu nasi matang, baru setrika.' },
  { combo: ['kompor', 'setrika'], level: 'merah',
    judul: '⚠️ Kombinasi Risiko Tinggi',
    pesan: 'Kompor listrik dan setrika adalah dua beban terbesar. Jangan nyalakan bersamaan.' },
];


/* =====================================================
   MASKOT VECTO — EKSPRESI DINAMIS
   MASKOT_MAP menghubungkan nama mode ke nama file.
   Kalau nama file berubah, cukup update di sini.
   Fungsi gantiVecto() ganti src gambar maskot,
   tampilkanVecto() sekaligus buka popupnya.
====================================================== */
const MASKOT_PATH = "maskot/";

const MASKOT_MAP = {
  happy:    "vecto-happy.png",
  shock:    "vecto-shock.png",
  confused: "vecto-confused.png",
  smart:    "vecto-smart.png",
  sleepy:   "vecto-sleepy.png",
  energy:   "vecto-energy.png",
};

/* Ganti gambar maskot sesuai mode — fallback ke "happy" kalau mode tidak dikenal */
function gantiVecto(mode = "happy") {
  const img = document.getElementById("vecto-img");
  if (!img) return;
  const file = MASKOT_MAP[mode] || MASKOT_MAP["happy"];
  img.src = MASKOT_PATH + file;
}

/* Isi teks popup dan buka sekaligus — dipanggil dari berbagai kondisi */
function tampilkanVecto(judul, pesan, mode = "happy") {
  document.getElementById("v-title").innerText = judul;
  document.getElementById("v-msg").innerText   = pesan;
  gantiVecto(mode);
  document.getElementById("vecto-popup").classList.remove("hidden");
}

/* Tutup popup dengan tambahkan class "hidden" */
function tutupPopup() {
  document.getElementById("vecto-popup").classList.add("hidden");
}


/* =====================================================
   NAVIGASI ANTAR HALAMAN
   Cara kerjanya simpel: hapus class "active" dari
   semua section, terus kasih ke section yang dituju.
   CSS yang urus apakah ditampilkan atau tidak.
====================================================== */
function navigasi(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}


/* =====================================================
   INISIALISASI — DIJALANKAN SAAT HALAMAN SELESAI LOAD
   Urutan: render preset dulu, tambah satu baris alat
   kosong otomatis, lalu tampilkan popup sambutan.
====================================================== */
window.onload = () => {
  renderPresets();
  tambahAlat();
  tampilkanVecto(
    "Halo, Saya Vecto ⚡",
    "Selamat datang di EnergiScan! Yuk cek konsumsi listrik rumahmu.",
    "happy"
  );
};


/* =====================================================
   EVENT: PILIH GOLONGAN VA
   Dijalankan setiap kali user ganti pilihan select.
   Ambil tarif dari value option dan VA dari data-va,
   simpan ke variabel global, lalu update panel info.
====================================================== */
document.getElementById("select-va").addEventListener("change", function () {
  const opt     = this.options[this.selectedIndex];
  currentTarif  = parseInt(this.value);        // tarif Rp/kWh
  currentVA     = parseInt(opt.dataset.va);    // batas VA rumah

  // Aktifkan tombol "Lanjut" setelah user pilih VA
  document.getElementById("btn-next").disabled = false;

  // Update panel info di sebelah kanan dengan data yang baru dipilih
  document.getElementById("info-tarif").innerHTML = `
    <h3>💡 Informasi Tarif</h3>
    <p>Daya Rumah: <b>${currentVA} VA</b></p>
    <p>Tarif PLN: <b>Rp ${currentTarif.toLocaleString("id-ID")}/kWh</b></p>
    <p style="margin-top:10px; font-size:0.85rem; color:#475569;">
      Tarif ini digunakan untuk menghitung estimasi tagihan bulananmu.
    </p>
  `;

  // Tampilkan popup Vecto dengan info daya yang dipilih
  tampilkanVecto(
    "Daya Berhasil Dipilih ⚡",
    `Rumahmu memakai daya ${currentVA} VA dengan tarif Rp ${currentTarif.toLocaleString("id-ID")}/kWh.`,
    "energy"
  );
});


/* =====================================================
   RENDER TOMBOL PRESET
   Loop array PRESETS dan buat button untuk masing-masing.
   Waktu diklik, langsung panggil tambahAlat() dengan
   nama dan watt dari preset yang dipilih.
====================================================== */
function renderPresets() {
  const wrap = document.getElementById("preset-grid");
  wrap.innerHTML = "";
  PRESETS.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    btn.innerHTML = `${item.nama}<br><small>${item.watt} W</small>`;
    btn.onclick   = () => tambahAlat(item.nama, item.watt);
    wrap.appendChild(btn);
  });
}


/* =====================================================
   TAMBAH / HAPUS BARIS ALAT
   tambahAlat() buat elemen DOM baru berupa form baris alat.
   Kalau dipanggil dari preset, nama dan watt sudah terisi.
   Kalau dipanggil manual, keduanya kosong.

   hapusAlat() pakai .closest() biar tidak rapuh —
   tidak bergantung pada struktur DOM yang spesifik.
====================================================== */
function tambahAlat(nama = "", watt = "") {
  const wrap = document.getElementById("list-alat");
  const row  = document.createElement("div");
  row.className = "glass-card alat-row no-hover";
  row.innerHTML = `
    <div class="alat-top">
      <!-- oninput langsung cek kombinasi berbahaya setiap kali nama diketik -->
      <input type="text" class="modern-input n" placeholder="Nama alat" value="${nama}" oninput="updateKontekstualWarning()">
      <button class="btn-hapus" onclick="hapusAlat(this)">✕</button>
    </div>
    <div class="alat-bottom">
      <!-- oninput juga update warning saat watt diisi -->
      <input type="number" class="modern-input w" placeholder="Watt" min="0" value="${watt}" oninput="updateKontekstualWarning()">
      <input type="number" class="modern-input j" placeholder="Jam / hari" min="0" max="24">
    </div>
  `;
  wrap.appendChild(row);
  // Cek ulang warning setiap baris baru ditambahkan
  updateKontekstualWarning();
}

/* Hapus baris alat dan langsung update warning */
function hapusAlat(btn) {
  btn.closest(".alat-row").remove();
  updateKontekstualWarning();
}

/* Hubungkan tombol "Tambah Alat Manual" ke fungsi tambahAlat */
document.getElementById("add-item").onclick = () => tambahAlat();


/* =====================================================
   CEK & TAMPILKAN PERINGATAN KOMBINASI BERBAHAYA
   Fungsi ini dipanggil setiap kali ada perubahan input.
   Alurnya:
   1. Kumpulkan semua nama alat yang sudah diisi watt-nya
   2. Cocokkan dengan ALAT_BERAT untuk identifikasi alat berat
   3. Cek apakah ada pasangan di KOMBINASI_BAHAYA yang match
   4. Kalau ada 3+ alat berat tapi belum ada yang merah, tambah warning kuning
   5. Tampilkan yang paling serius duluan (merah > kuning)
====================================================== */
function updateKontekstualWarning() {
  const card = document.getElementById("warning-beban");

  // Kumpulkan nama alat yang sudah diisi watt-nya (keduanya tidak boleh kosong)
  const namaAlat = [];
  document.querySelectorAll("#list-alat .alat-row").forEach(item => {
    const n = (item.querySelector(".n").value || "").toLowerCase().trim();
    const w = parseFloat(item.querySelector(".w").value) || 0;
    if (n && w > 0) namaAlat.push(n);
  });

  // Kalau tidak ada alat, sembunyikan warning dan keluar
  if (namaAlat.length === 0) { card.style.display = "none"; return; }

  // Filter alat-alat berat yang keywords-nya cocok dengan nama yang diinput
  const alatBeratDitemukan = ALAT_BERAT.filter(ab =>
    namaAlat.some(n => ab.keywords.some(k => n.includes(k)))
  );

  // Cek setiap kombinasi bahaya — masukkan ke array kalau semua anggota combo ada
  const peringatan = [];
  KOMBINASI_BAHAYA.forEach(kb => {
    if (kb.combo.every(id => alatBeratDitemukan.some(ab => ab.id === id))) {
      peringatan.push(kb);
    }
  });

  // Kalau ada 3+ alat berat tapi belum ada peringatan merah, tambah warning kuning generik
  if (alatBeratDitemukan.length >= 3 && !peringatan.some(p => p.level === "merah")) {
    peringatan.push({
      level: "kuning",
      judul: "⚡ Banyak Alat Berdaya Besar",
      pesan: `Kamu punya ${alatBeratDitemukan.length} alat berdaya besar (${alatBeratDitemukan.map(a => a.label).join(", ")}). Buat jadwal penggunaan bergantian agar tidak overload.`
    });
  }

  // Tidak ada peringatan sama sekali — sembunyikan card dan selesai
  if (peringatan.length === 0) { card.style.display = "none"; return; }

  // Urutkan: merah duluan, baru kuning
  peringatan.sort((a, b) => (a.level === "merah" ? -1 : 1));
  const dominan = peringatan[0];

  // Tampilkan semua peringatan yang aktif dalam satu card
  card.className    = `warning-beban-card level-${dominan.level}`;
  card.style.display = "block";
  card.innerHTML = `
    <h4>${dominan.judul}</h4>
    ${peringatan.map(p => `
      <div class="warning-item">
        ${p.judul !== dominan.judul ? `<strong>${p.judul}</strong>` : ""}
        ${p.pesan}
      </div>`).join("")}
  `;
}


/* =====================================================
   PROSES DATA & KALKULASI UTAMA
   Dipanggil waktu user klik "Hitung Sekarang".
   Pakai setTimeout 80ms biar browser sempat render
   tombol loading dulu sebelum kalkulasi jalan.

   Rumus: E (kWh) = P (Watt) × t (jam) × hari / 1000
   Hari dihitung dinamis dari tanggal sekarang —
   tidak hardcode 30 biar Februari tidak salah hitung.
====================================================== */
function prosesData() {
  const rows      = document.querySelectorAll(".alat-row");
  const btnHitung = document.getElementById("btn-hitung");

  // Ubah tombol jadi loading state dulu biar user tahu kalkulasi sedang jalan
  btnHitung.innerText  = "Menghitung... ⏳";
  btnHitung.disabled   = true;

  setTimeout(() => {
    let totalKwh = 0;
    const labels = [], values = [];
    lastResults  = [];
    let adaError = false;

    // Hitung jumlah hari di bulan ini secara dinamis (bukan hardcode 30)
    const hariSebulan = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate();

    rows.forEach(row => {
      const nama    = row.querySelector(".n").value.trim() || "Alat";
      const wattRaw = parseFloat(row.querySelector(".w").value);
      const jamRaw  = parseFloat(row.querySelector(".j").value);

      // Validasi: nilai harus positif dan jam tidak boleh lebih dari 24
      const watt = (!isNaN(wattRaw) && wattRaw > 0)                    ? wattRaw : 0;
      const jam  = (!isNaN(jamRaw)  && jamRaw  > 0 && jamRaw <= 24)    ? jamRaw  : 0;

      // Highlight input yang nilainya tidak valid dengan border merah
      const wInput = row.querySelector(".w");
      const jInput = row.querySelector(".j");
      wInput.style.borderColor = (wattRaw > 0 || isNaN(wattRaw)) ? "" : "#ef4444";
      jInput.style.borderColor = (jamRaw > 0 && jamRaw <= 24) || isNaN(jamRaw) ? "" : "#ef4444";

      // Tandai ada error kalau jam melebihi 24
      if (!isNaN(jamRaw) && jamRaw > 24) adaError = true;

      // Hitung kWh hanya kalau kedua nilai valid
      if (watt > 0 && jam > 0) {
        const kwh = (watt * jam * hariSebulan) / 1000;
        totalKwh += kwh;
        labels.push(nama);
        values.push(parseFloat(kwh.toFixed(2)));
        lastResults.push({ nama, watt, jam, kwh });
      }
    });

    // Kembalikan tombol ke kondisi normal
    btnHitung.innerText = "Hitung Sekarang ➔";
    btnHitung.disabled  = false;

    // Kalau ada jam > 24, hentikan dan tampilkan pesan error
    if (adaError) {
      tampilkanVecto(
        "Jam Tidak Valid ⏰",
        "Jam pemakaian maksimal 24 jam/hari. Cek input yang ditandai merah.",
        "confused"
      );
      return;
    }

    // Kalau tidak ada data yang valid sama sekali, hentikan juga
    if (totalKwh <= 0) {
      tampilkanVecto(
        "Data Belum Lengkap 😅",
        "Isi watt dan jam pemakaian dulu ya — keduanya harus lebih dari 0.",
        "confused"
      );
      return;
    }

    // Hitung tagihan dan tampilkan ke kartu hasil
    const totalRp = totalKwh * currentTarif;
    document.getElementById("out-kwh").innerText = totalKwh.toFixed(1) + " kWh";
    document.getElementById("out-rp").innerText  = "Rp " + totalRp.toLocaleString("id-ID");

    // Pindah ke halaman hasil
    navigasi("p-result");

    // Isi semua bagian halaman hasil
    updateChart(labels, values);
    updateTips(totalKwh);
    updateSimulasi();
    updateInfoTambahan(totalKwh);

    // Canvas vektor perlu setTimeout — tunggu sampai canvas benar-benar ter-render
    // biar offsetWidth terbaca dengan benar (tidak 0)
    setTimeout(() => gambarVektor(), 120);

    // Smart Diagnosis: cek apakah ada satu alat yang menyumbang >40% konsumsi
    const biang = lastResults.find(r => (r.kwh / totalKwh) > 0.4);
    if (biang) {
      tampilkanVecto(
        "🔍 Ketemu Biang Borosnya!",
        `"${biang.nama}" memakan lebih dari 40% total listrikmu. Kurangi jam pakainya!`,
        "shock"
      );
    } else if (totalKwh > 200) {
      tampilkanVecto(
        "⚠️ Konsumsi Cukup Tinggi!",
        "Lihat grafik dan simulasi hemat di bawah untuk menemukan cara berhemat.",
        "confused"
      );
    } else {
      tampilkanVecto(
        "Analisis Selesai 🚀",
        "Konsumsimu masih wajar. Scroll ke bawah untuk detail vektor dan simulasi hemat!",
        "happy"
      );
    }
  }, 80);
}


/* =====================================================
   UPDATE GRAFIK DONAT (CHART.JS)
   Destroy dulu chart lama sebelum buat yang baru —
   kalau tidak, chart lama masih ada di memori
   dan bisa bikin glitch atau memory leak.
   12 warna disiapkan buat antisipasi banyak alat.
====================================================== */
function updateChart(labels, values) {
  const ctx = document.getElementById("myChart");
  if (myChart) myChart.destroy(); // hapus chart sebelumnya dulu
  myChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#3d5afe","#00c6ff","#f59e0b","#22c55e",
          "#ef4444","#8b5cf6","#14b8a6","#f97316",
          "#f472b6","#4ade80","#facc15","#38bdf8"
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });
}


/* =====================================================
   UPDATE PANEL TIPS HEMAT (KONTEKSTUAL)
   Cocokkan nama alat user dengan keywords di database.
   Kumpulkan semua tips yang relevan, pilih satu acak.
   Kalau tidak ada yang cocok, ambil dari TIPS_UMUM.
   Plus: kalau ada biang boros >40%, tambahkan saran khusus.
====================================================== */
function updateTips(totalKwh) {
  // Ambil nama semua alat dalam lowercase buat pencocokan
  const namaUser = lastResults.map(r => r.nama.toLowerCase());

  // Kumpulkan semua tips yang keyword-nya cocok dengan alat user
  let tipsRelevan = [];
  TIPS_KONTEKSTUAL.forEach(entry => {
    const cocok = namaUser.some(n => entry.keywords.some(k => n.includes(k)));
    if (cocok) tipsRelevan.push(...entry.tips);
  });
  // Fallback ke tips umum kalau tidak ada yang relevan
  if (tipsRelevan.length === 0) tipsRelevan = [...TIPS_UMUM];

  // Pilih satu tips secara acak dari yang relevan
  const tipTerpilih = tipsRelevan[Math.floor(Math.random() * tipsRelevan.length)];

  // Kalau ada alat biang boros (>40% total), tambahkan saran spesifik di bawahnya
  const biang = lastResults.find(r => (r.kwh / totalKwh) > 0.4);
  const saranBiang = biang
    ? `<p style="margin-top:12px; padding-top:12px; border-top:1px solid #bfdbfe;">
         <strong style="color:#1d4ed8;">⚠️ Perhatian Khusus:</strong><br>
         Kurangi jam pemakaian <strong>${biang.nama}</strong> — alat ini menyumbang
         <strong>${((biang.kwh / totalKwh) * 100).toFixed(0)}%</strong> dari total konsumsimu.
       </p>`
    : "";

  document.getElementById("v-tips").innerHTML = `
    <h3>💡 Tips Hemat dari Vecto</h3>
    <p>${tipTerpilih}</p>
    ${saranBiang}
  `;
}


/* =====================================================
   UPDATE INFO TAMBAHAN (3 KARTU BAWAH)
   Isi kartu Profil Rumah, Fakta Energi, dan Rekomendasi.
   Kontennya dinamis berdasarkan data kalkulasi user —
   bukan teks statis yang sama untuk semua orang.
====================================================== */
function updateInfoTambahan(totalKwh) {
  // Jumlah total watt semua alat (tanpa dikalikan jam)
  let totalWatt = lastResults.reduce((sum, r) => sum + r.watt, 0);

  // Tentukan status beban berdasarkan perbandingan total watt vs batas VA
  let status   = "✅ Aman";
  let ekspresi = "happy";
  if (totalWatt > currentVA) {
    status   = "🔴 Overload";       // total watt melebihi VA — bahaya
    ekspresi = "shock";
  } else if (totalWatt > currentVA * 0.8) {
    status   = "🟡 Mendekati Batas"; // lebih dari 80% VA — hati-hati
    ekspresi = "confused";
  }

  // Ganti ekspresi maskot sesuai status beban
  gantiVecto(ekspresi);

  // Isi kartu Profil Rumah
  document.getElementById("profil-rumah").innerHTML = `
    <div class="info-line">Daya Rumah: <b>${currentVA} VA</b></div>
    <div class="info-line">Total Beban: <b>${totalWatt} W</b></div>
    <div class="info-line">Status: <b>${status}</b></div>
    <div class="info-line">Tarif: <b>Rp ${currentTarif.toLocaleString("id-ID")}/kWh</b></div>
  `;

  // Cek apakah user punya AC atau lampu LED — biar fakta yang ditampilkan relevan
  const namaUser = lastResults.map(r => r.nama.toLowerCase());
  const adaAC    = namaUser.some(n => n.includes("ac") || n.includes("pendingin"));
  const adaLED   = namaUser.some(n => n.includes("lampu") || n.includes("led"));

  const faktaList = [
    "1 kWh = menggunakan 1000 watt selama 1 jam penuh.",
    adaAC  ? "AC adalah salah satu alat paling boros — pertimbangkan timer." : "Gunakan alat berdaya rendah untuk aktivitas ringan.",
    adaLED ? "Lampu LED yang kamu pakai sudah hemat ~80% vs lampu pijar." : "Beralih ke lampu LED bisa hemat hingga 80% biaya penerangan.",
  ];
  document.getElementById("fakta-energi").innerHTML =
    faktaList.map(f => `<div class="info-line">${f}</div>`).join("");

  // Isi kartu Rekomendasi: cari alat yang konsumsinya paling besar
  const paling_boros = [...lastResults].sort((a, b) => b.kwh - a.kwh)[0];
  document.getElementById("ai-analisa").innerHTML = `
    <div class="info-line">
      Alat paling boros: <b>${paling_boros.nama}</b> (${paling_boros.kwh.toFixed(1)} kWh)
    </div>
    <div class="info-line">Gunakan simulasi hemat di bawah untuk kurangi durasi alat boros.</div>
    <div class="info-line">Hindari menyalakan alat berdaya besar secara bersamaan.</div>
  `;
}


/* =====================================================
   VISUALISASI VEKTOR — CANVAS 2D
   Ini bagian paling kompleks di seluruh script.
   Gambar diagram vektor kartesian dari nol pakai
   Canvas API — tidak pakai library sama sekali.

   Alur kerja:
   1. Baca lebar canvas aktual (bukan hardcode) buat responsif
   2. Pisahkan alat ringan (≤100W) → sumbu X
      dan alat berat (>100W) → sumbu Y
   3. Hitung semua nilai matematika (|R|, θ, unit vektor)
   4. Gambar grid kartesian dengan tick marks
   5. Animasi sequential: X muncul dulu → lalu Y → lalu R
   6. Update panel rumus dan langkah edukasi
====================================================== */
let vektorAnimFrame = null; // simpan ID animasi biar bisa di-cancel waktu replay

/* Tombol "Putar Ulang" tinggal panggil ulang gambarVektor() */
function replayVektor() { gambarVektor(); }

function gambarVektor() {
  const canvas = document.getElementById("vectorCanvas");
  const ctx    = canvas.getContext("2d");

  // Baca lebar aktual canvas — jangan hardcode, biar pas di semua ukuran layar
  const W = canvas.offsetWidth || 680;
  const H = Math.round(W * 0.62);   // rasio tinggi 62% dari lebar
  canvas.width  = W;
  canvas.height = H;

  // Pisahkan alat: ≤100W jadi komponen X, >100W jadi komponen Y
  let ringan = 0, sedang = 0;
  const detailRingan = [], detailSedang = [];
  lastResults.forEach(r => {
    if (r.watt <= 100) { ringan += r.watt; detailRingan.push(r); }
    else               { sedang += r.watt; detailSedang.push(r); }
  });

  // Hitung semua nilai matematika yang dibutuhkan
  const R        = Math.sqrt(ringan ** 2 + sedang ** 2);            // |R| = √(X²+Y²)
  const theta    = ringan > 0 ? Math.atan2(sedang, ringan) : Math.PI / 2;  // θ = arctan(Y/X)
  const thetaDeg = (theta * 180 / Math.PI).toFixed(2);
  const ux       = R > 0 ? (ringan / R).toFixed(4) : "0";          // komponen X unit vektor
  const uy       = R > 0 ? (sedang / R).toFixed(4) : "0";          // komponen Y unit vektor

  // Hitung padding dan area gambar yang bisa dipakai
  const pad  = { left: W * 0.14, right: W * 0.06, top: H * 0.08, bottom: H * 0.14 };
  const ox   = pad.left;             // titik origin X (pojok kiri bawah grid)
  const oy   = H - pad.bottom;       // titik origin Y
  const gW   = W - pad.left - pad.right;   // lebar area grid
  const gH   = H - pad.top  - pad.bottom;  // tinggi area grid

  // Skala: nilai terbesar mengisi 78% ruang — biar panah tidak keluar batas
  const maxVal = Math.max(ringan, sedang, 100);
  const scale  = (Math.min(gW, gH) * 0.78) / maxVal;
  const px     = ox + ringan * scale;   // posisi ujung komponen X
  const py     = oy - sedang * scale;   // posisi ujung komponen Y

  /* Hitung step grid yang enak dibaca (10, 20, 25, 50, 100, dst) */
  function hitungStep(max) {
    for (const c of [10,20,25,50,100,150,200,250,500,1000]) {
      if (max / c <= 8) return c;  // maksimal 8 garis biar tidak terlalu rapat
    }
    return Math.ceil(max / 5 / 100) * 100;
  }

  /* Gambar kepala panah (segitiga) di ujung vektor */
  function kepalaPanah(x, y, angle, color) {
    const s = Math.max(8, W * 0.014);   // ukuran kepala panah proporsional dengan canvas
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * Math.cos(angle - 0.4), y - s * Math.sin(angle - 0.4));
    ctx.lineTo(x - s * Math.cos(angle + 0.4), y - s * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  /* Gambar latar grid kartesian + sumbu + label */
  function gambarGrid() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fafbff";
    ctx.fillRect(0, 0, W, H);

    const step = hitungStep(maxVal);
    const fs   = Math.max(10, W * 0.017);

    // Gambar garis-garis grid (vertikal dan horizontal)
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth   = 1;
    for (let v = 0; v <= maxVal + step; v += step) {
      const gx = ox + v * scale;
      if (gx <= ox + gW + 2) {
        ctx.beginPath(); ctx.moveTo(gx, pad.top); ctx.lineTo(gx, oy); ctx.stroke();
      }
      const gy = oy - v * scale;
      if (gy >= pad.top - 2) {
        ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + gW, gy); ctx.stroke();
      }
    }

    // Label nilai di tiap garis grid (sumbu X di bawah, sumbu Y di kiri)
    ctx.font      = `${fs}px Segoe UI`;
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    for (let v = step; v <= maxVal; v += step) {
      const gx = ox + v * scale;
      if (gx <= ox + gW + 2) ctx.fillText(v+"W", gx, oy + 18);
      const gy = oy - v * scale;
      if (gy >= pad.top - 2) {
        ctx.textAlign = "right";
        ctx.fillText(v+"W", ox - 6, gy + 4);
        ctx.textAlign = "center";
      }
    }

    // Gambar sumbu X dengan panah di ujungnya
    ctx.strokeStyle = "#334155"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + gW + 12, oy); ctx.stroke();
    kepalaPanah(ox + gW + 12, oy, 0, "#334155");

    // Gambar sumbu Y dengan panah di ujungnya
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, pad.top - 12); ctx.stroke();
    kepalaPanah(ox, pad.top - 12, -Math.PI/2, "#334155");

    // Label nama sumbu X dan Y
    const fsL = Math.max(11, W * 0.019);
    ctx.font = `600 ${fsL}px Segoe UI`;
    ctx.fillStyle = "#475569"; ctx.textAlign = "center";
    ctx.fillText("Komponen X — Alat Ringan ≤100W (Watt)", ox + gW/2, oy + 36);
    ctx.save();
    ctx.translate(ox - 42, oy - gH/2);
    ctx.rotate(-Math.PI/2);  // putar 90° buat label sumbu Y
    ctx.fillText("Komponen Y — Alat Berat >100W (Watt)", 0, 0);
    ctx.restore();

    // Label titik origin
    ctx.fillStyle = "#94a3b8"; ctx.font = `${fs}px Segoe UI`; ctx.textAlign = "right";
    ctx.fillText("O(0,0)", ox - 5, oy + 16);
  }

  /* =====================================================
     ANIMASI SEQUENTIAL TIGA FASE
     DX, DY, DR = durasi animasi tiap vektor (ms)
     JEDA = jeda antar fase biar tidak langsung semua muncul
     easeOut cubic: gerakan melambat di akhir — lebih natural
  ====================================================== */
  if (vektorAnimFrame) cancelAnimationFrame(vektorAnimFrame); // batalkan animasi sebelumnya
  const DX=700, DY=700, DR=800, JEDA=250, TOTAL=DX+JEDA+DY+JEDA+DR;
  let startTime = null;

  /* Fungsi easing: mulai cepat, melambat di ujung */
  function easeOut(t) { return 1 - Math.pow(1-t, 3); }

  function animate(ts) {
    if (!startTime) startTime = ts;
    const el = ts - startTime;   // elapsed time sejak animasi mulai

    gambarGrid(); // gambar ulang grid tiap frame biar bersih

    const fs = Math.max(11, W * 0.018);
    ctx.font = `600 ${fs}px Segoe UI`;

    // --- FASE 1: Vektor X (hijau) ---
    const tX = Math.min(el / DX, 1);   // progress 0-1
    if (tX > 0 && ringan > 0) {
      const curX = ox + ringan * scale * easeOut(tX);  // posisi ujung saat ini
      ctx.strokeStyle = "#22c55e"; ctx.fillStyle = "#22c55e";
      ctx.lineWidth = Math.max(3, W * 0.005);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(curX, oy); ctx.stroke();
      kepalaPanah(curX, oy, 0, "#22c55e");
      // Label X muncul setelah animasi selesai
      if (tX >= 1) {
        ctx.textAlign = "center";
        ctx.fillText(`X = ${ringan} W`, (ox+px)/2, oy - 14);
      }
    }

    // --- FASE 2: Vektor Y (kuning) — mulai setelah X + jeda ---
    const startY = DX + JEDA;
    if (el > startY && sedang > 0) {
      const tY   = Math.min((el - startY) / DY, 1);
      const curY = oy - sedang * scale * easeOut(tY);
      ctx.strokeStyle = "#f59e0b"; ctx.fillStyle = "#f59e0b";
      ctx.lineWidth = Math.max(3, W * 0.005);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, curY); ctx.stroke();
      kepalaPanah(ox, curY, -Math.PI/2, "#f59e0b");
      if (tY >= 1) {
        ctx.textAlign = "left";
        ctx.fillText(`Y = ${sedang} W`, ox + 10, (oy+py)/2);
      }
    }

    // --- FASE 3: Resultan R (biru) — mulai setelah Y + jeda ---
    const startR = startY + DY + JEDA;
    if (el > startR && R > 0) {
      const tR   = Math.min((el - startR) / DR, 1);
      // Interpolasi dari origin ke titik ujung (px, py)
      const curPx = ox + (px - ox) * easeOut(tR);
      const curPy = oy + (py - oy) * easeOut(tR);
      ctx.strokeStyle = "#3d5afe"; ctx.fillStyle = "#3d5afe";
      ctx.lineWidth = Math.max(3, W * 0.006);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(curPx, curPy); ctx.stroke();
      kepalaPanah(curPx, curPy, Math.atan2(py-oy, px-ox), "#3d5afe");

      if (tR >= 1) {
        // Label |R| di tengah panah resultan
        const fsB = Math.max(12, W * 0.02);
        ctx.font = `700 ${fsB}px Segoe UI`;
        ctx.fillStyle = "#1d4ed8"; ctx.textAlign = "left";
        ctx.fillText(`|R| = ${R.toFixed(1)} W`, (ox+px)/2 + 8, (oy+py)/2 - 12);

        // Gambar busur sudut θ dengan garis putus-putus ungu
        if (ringan > 0 && sedang > 0) {
          const arcR = Math.min(gW, gH) * 0.14;
          ctx.beginPath();
          ctx.arc(ox, oy, arcR, -theta, 0, true);
          ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 2;
          ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]); // reset dash
          ctx.font = `600 ${Math.max(11, W*0.018)}px Segoe UI`;
          ctx.fillStyle = "#7c3aed"; ctx.textAlign = "left";
          ctx.fillText(`θ=${thetaDeg}°`, ox + arcR + 6, oy - arcR * 0.35);
        }

        // Titik koordinat ujung resultan
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
        ctx.fillStyle = "#3d5afe"; ctx.fill();
        ctx.font = `${Math.max(11,W*0.017)}px Segoe UI`;
        ctx.fillStyle = "#1e40af"; ctx.textAlign = "left";
        ctx.fillText(`(${ringan}, ${sedang})`, px+8, py-8);
      }
    }

    // Lanjutkan animasi sampai semua fase selesai
    if (el < TOTAL) vektorAnimFrame = requestAnimationFrame(animate);
  }

  vektorAnimFrame = requestAnimationFrame(animate);

  /* Update panel rumus dengan angka nyata hasil kalkulasi */
  document.getElementById("rumus-magnitude").innerText =
    `|R| = √(${ringan}² + ${sedang}²) = √${ringan**2+sedang**2} = ${R.toFixed(4)} W`;
  document.getElementById("rumus-sudut").innerText =
    ringan > 0 ? `θ = arctan(${sedang}/${ringan}) = ${thetaDeg}°` : `θ = 90° (tidak ada komponen X)`;
  document.getElementById("rumus-unit").innerText = `R̂ = ${ux}î + ${uy}ĵ`;
  document.getElementById("rumus-vektor").innerText = `R = ${ringan}î + ${sedang}ĵ  (Watt)`;

  /* Update baris ringkasan angka di bawah canvas */
  document.getElementById("vektor-output").innerHTML = `
    <span>🟢 Komponen X: <b>${ringan} W</b></span>
    <span>🔵 Resultan |R|: <b>${R.toFixed(2)} W</b></span>
    <span>🟡 Komponen Y: <b>${sedang} W</b></span>
    <span>📐 Sudut θ: <b>${thetaDeg}°</b></span>
  `;

  /* Update panel langkah perhitungan step-by-step */
  const lR = detailRingan.length ? detailRingan.map(r=>`${r.nama}(${r.watt}W)`).join(", ") : "—";
  const lS = detailSedang.length ? detailSedang.map(r=>`${r.nama}(${r.watt}W)`).join(", ") : "—";
  document.getElementById("edukasi-steps").innerHTML = `
    <div class="step-item">
      <div class="step-num">1</div>
      <div class="step-body">
        <div class="step-title">Identifikasi Komponen Vektor</div>
        <div class="step-detail">Setiap alat listrik dimodelkan sebagai vektor daya. Alat ≤100W → <b>komponen X</b>, alat >100W → <b>komponen Y</b>.</div>
        <div class="step-result">X: ${lR}<br>Y: ${lS}</div>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">2</div>
      <div class="step-body">
        <div class="step-title">Hitung Besar Tiap Komponen</div>
        <div class="step-detail">Jumlahkan semua daya pada masing-masing sumbu:</div>
        <div class="step-result">
          X = ${detailRingan.map(r=>r.watt).join(" + ")||"0"} = <b>${ringan} W</b><br>
          Y = ${detailSedang.map(r=>r.watt).join(" + ")||"0"} = <b>${sedang} W</b>
        </div>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">3</div>
      <div class="step-body">
        <div class="step-title">Hitung Magnitude Resultan (Teorema Pythagoras)</div>
        <div class="step-detail">Besar vektor resultan dihitung dari panjang diagonal jajargenjang komponen:</div>
        <div class="step-result">
          |R| = √(X² + Y²)<br>
          |R| = √(${ringan}² + ${sedang}²)<br>
          |R| = √(${ringan**2} + ${sedang**2})<br>
          |R| = √${ringan**2+sedang**2} = <b>${R.toFixed(4)} W</b>
        </div>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">4</div>
      <div class="step-body">
        <div class="step-title">Hitung Sudut Resultan (θ)</div>
        <div class="step-detail">Sudut terhadap sumbu X dihitung menggunakan fungsi arctangent:</div>
        <div class="step-result">
          θ = arctan(Y / X) = arctan(${sedang} / ${ringan||1})<br>
          θ = <b>${thetaDeg}°</b>
        </div>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">5</div>
      <div class="step-body">
        <div class="step-title">Hitung Unit Vektor (R̂)</div>
        <div class="step-detail">Unit vektor menunjukkan arah resultan dengan magnitude = 1 (vektor satuan):</div>
        <div class="step-result">
          R̂ = (X/|R|)î + (Y/|R|)ĵ<br>
          R̂ = (${ringan}/${R.toFixed(2)})î + (${sedang}/${R.toFixed(2)})ĵ<br>
          R̂ = <b>${ux}î + ${uy}ĵ</b>
        </div>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">6</div>
      <div class="step-body">
        <div class="step-title">Interpretasi Fisika</div>
        <div class="step-detail">
          Vektor resultan R merepresentasikan total beban listrik rumah secara matematis:<br>
          • Besar resultan: <b>${R.toFixed(2)} W</b><br>
          • Sudut θ = ${thetaDeg}° — menunjukkan proporsi beban berat vs ringan<br>
          • Dominasi: ${sedang > ringan ? "<b>alat berdaya besar</b> mendominasi konsumsi" : "<b>alat berdaya kecil</b> mendominasi konsumsi"}
        </div>
      </div>
    </div>
  `;
}


/* =====================================================
   SIMULASI HEMAT — BUAT BARIS SLIDER
   Tiap alat dapat slider sendiri dengan range 0 sampai
   jam aslinya. Data disimpan di dataset (data-*) biar
   hitungHemat() bisa baca tanpa perlu akses lastResults.
====================================================== */
function updateSimulasi() {
  const wrap = document.getElementById("simulasi-list");
  wrap.innerHTML = "";

  // Hitung hari bulan ini — sama seperti di prosesData()
  const hariSebulan = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate();

  lastResults.forEach((alat, i) => {
    const div = document.createElement("div");
    div.className = "sim-row";
    div.innerHTML = `
      <div class="sim-top">
        <span class="sim-nama">${alat.nama}</span>
        <!-- Teks penghematan diisi hitungHemat() waktu slider digeser -->
        <span class="sim-saving" id="saving-${i}"></span>
      </div>
      <div class="sim-bottom">
        <span>${alat.jam} jam asli</span>
        <!-- Slider mulai dari nilai maksimal (jam asli) — digeser ke kiri untuk hemat -->
        <input
          type="range"
          class="sim-slider"
          min="0" max="${alat.jam}" step="0.5" value="${alat.jam}"
          data-index="${i}"
          data-watt="${alat.watt}"
          data-jam-asli="${alat.jam}"
          oninput="hitungHemat(this, ${hariSebulan})"
        >
        <!-- Angka jam yang sekarang dipilih slider — update real-time -->
        <span class="sim-jam-baru" id="jam-baru-${i}">${alat.jam} jam</span>
      </div>
    `;
    wrap.appendChild(div);
  });

  // Sembunyikan kotak total hemat di awal (belum ada slider yang digeser)
  const totalEl = document.getElementById("total-hemat");
  totalEl.style.display = "none";
}


/* =====================================================
   HITUNG HEMAT PER SLIDER
   Dipanggil setiap kali slider digeser (oninput).
   Hitung selisih kWh dan Rp antara jam asli vs jam baru,
   lalu hitung total hemat dari semua slider sekaligus.
====================================================== */
function hitungHemat(slider, hariSebulan) {
  const i       = parseInt(slider.dataset.index);
  const watt    = parseFloat(slider.dataset.watt);
  const jamAsli = parseFloat(slider.dataset.jamAsli);
  const jamBaru = parseFloat(slider.value);

  // Update teks jam yang dipilih di sebelah kanan slider
  document.getElementById(`jam-baru-${i}`).innerText = jamBaru.toFixed(1) + " jam";

  // Hitung penghematan untuk alat ini saja
  const kwhHemat = (watt * (jamAsli - jamBaru) * hariSebulan) / 1000;
  const rpHemat  = kwhHemat * currentTarif;

  // Tampilkan teks "Hemat Rp X.XXX" kalau ada penghematan, kosongkan kalau tidak ada
  document.getElementById(`saving-${i}`).innerText =
    rpHemat > 0 ? `Hemat Rp ${Math.round(rpHemat).toLocaleString("id-ID")}` : "";

  // Hitung total hemat dari semua slider yang ada di halaman
  let totalHemat = 0;
  document.querySelectorAll(".sim-slider").forEach(s => {
    const kwhS = (parseFloat(s.dataset.watt) * (parseFloat(s.dataset.jamAsli) - parseFloat(s.value)) * hariSebulan) / 1000;
    totalHemat += kwhS * currentTarif;
  });

  // Tampilkan atau sembunyikan kotak total hemat
  const totalEl = document.getElementById("total-hemat");
  if (totalHemat > 0) {
    totalEl.style.display = "block";
    totalEl.innerHTML = `💰 Total potensi hemat: <strong>Rp ${Math.round(totalHemat).toLocaleString("id-ID")}/bulan</strong>`;
  } else {
    totalEl.style.display = "none";
  }
}
