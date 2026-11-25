/* =====================================================================
 * SIMTESIS — frontend (vanilla JS, tanpa build)
 * Magister Teknik Sipil, Universitas Janabadra
 * ===================================================================== */
(function () {
  'use strict';

  var CFG = window.SIMTESIS_CONFIG || {};
  var S = {
    token: localStorage.getItem('simtesis_token') || '',
    user: safeJSON(localStorage.getItem('simtesis_user')),
    meta: null, D: null, open: new Set(), openFor: null
  };
  var app = document.getElementById('app');

  // ------------------------------------------------------------ helpers
  function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : '#'; }
  function fmt(iso) {
    if (!iso) return '-';
    var d = new Date(iso); if (isNaN(d)) return esc(iso);
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtD(iso) {
    if (!iso) return '-';
    var d = new Date(iso); if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtSize(b) { b = Number(b || 0); if (!b) return ''; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function go(h) { if (location.hash === h) router(); else location.hash = h; }

  var STATUS = {
    SELESAI: 'Selesai', MENUNGGU: 'Menunggu persetujuan', REVISI: 'Perlu revisi', BERJALAN: 'Sedang berjalan',
    TERKUNCI: 'Belum terbuka', LULUS: 'Semua tahap selesai', BELUM: 'Belum mengisi'
  };
  var PERAN = { mahasiswa: 'Mahasiswa', pembimbing1: 'Pembimbing 1', pembimbing2: 'Pembimbing 2', admin: 'Admin Prodi', dosen: 'Dosen' };
  function chip(st, rev) {
    var l = STATUS[st] || st;
    if (st === 'REVISI' && rev) l = 'Perlu revisi ke-' + rev;
    return '<span class="chip s-' + esc(st) + '">' + esc(l) + '</span>';
  }
  function namaDosen(D, b, usul) { return b ? esc(b.nama) : (usul ? '<span class="faint">usulan: ' + esc(usul.nama) + '</span>' : '—'); }
  function jalurChip(j) { return j ? '<span class="chip nodot j-' + esc(j) + '">Jalur ' + esc(j) + '</span>' : '<span class="chip nodot s-BELUM">Jalur belum dipilih</span>'; }
  function stageName(n) { var t = S.meta && S.meta.tahap[n - 1]; return t ? t.nama : (n > 5 ? 'Selesai' : '-'); }
  function opt(list, val, ph) {
    return (ph !== undefined ? '<option value="">' + esc(ph) + '</option>' : '') + list.map(function (x) {
      var v = typeof x === 'object' ? x.v : x, l = typeof x === 'object' ? x.l : x;
      return '<option value="' + esc(v) + '"' + (String(v) === String(val || '') ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }

  function toast(msg, type) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, type === 'err' ? 6000 : 3200);
  }

  function busy(btn, fn) {
    if (btn && btn.disabled) return Promise.resolve();
    var html = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (btn.dataset.busy || 'Memproses…'); }
    return Promise.resolve().then(fn).catch(function (e) { toast(e.message || String(e), 'err'); })
      .then(function () { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = html; } });
  }

  // ------------------------------------------------------------ API
  function api(action, data) {
    if (!CFG.API_URL || CFG.API_URL.indexOf('GANTI_DENGAN') >= 0)
      return Promise.reject(new Error('API_URL belum diatur. Buka config.js dan isi dengan URL Web App Apps Script.'));
    return fetch(CFG.API_URL, {
      method: 'POST',
      // tanpa header khusus → "simple request", tidak memicu preflight CORS
      body: JSON.stringify({ action: action, data: data || {}, token: S.token })
    }).catch(function () {
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet atau URL API.');
    }).then(function (res) {
      return res.json().catch(function () {
        throw new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Siapa saja".');
      });
    }).then(function (j) {
      if (!j.ok) {
        if (j.code === 'AUTH' && action !== 'login') { clearSession(); setTimeout(function () { go('#/login'); }, 0); }
        throw new Error(j.error || 'Terjadi kesalahan.');
      }
      return j.data;
    });
  }

  function saveSession(token, user) {
    S.token = token; S.user = user;
    localStorage.setItem('simtesis_token', token);
    localStorage.setItem('simtesis_user', JSON.stringify(user));
  }
  function clearSession() {
    S.token = ''; S.user = null; S.D = null; S.openFor = null;
    localStorage.removeItem('simtesis_token'); localStorage.removeItem('simtesis_user');
  }

  // ------------------------------------------------------------ router
  var ROUTES = [
    { re: /^#\/login$/, view: viewLogin, pub: true },
    { re: /^#\/daftar$/, view: viewRegister, pub: true },
    { re: /^(#\/?)?$/, view: viewHome },
    { re: /^#\/tesis\/([\w-]+)$/, view: viewTesis },
    { re: /^#\/pengguna$/, view: viewUsers, role: 'admin' },
    { re: /^#\/akun$/, view: viewAkun }
  ];

  function router() {
    var h = location.hash || '#/';
    var r = null, m = null;
    for (var i = 0; i < ROUTES.length; i++) { m = h.match(ROUTES[i].re); if (m) { r = ROUTES[i]; break; } }
    if (!r) { go('#/'); return; }
    if (!r.pub && !S.token) { go('#/login'); return; }
    if (r.pub && S.token) { go('#/'); return; }
    if (r.role && S.user && S.user.role !== r.role) { go('#/'); return; }
    app.onclick = null; app.onchange = null; app.onsubmit = null; app.oninput = null;
    renderTopbar(h);
    app.innerHTML = '<div class="loading-page"><div class="spinner"></div></div>';
    window.scrollTo(0, 0);
    loadMeta().then(function () { return r.view.apply(null, m.slice(1)); }).catch(function (e) {
      app.innerHTML = '<div class="card pad" style="max-width:640px;margin:40px auto"><h3>Gagal memuat</h3><p class="muted">' + esc(e.message) +
        '</p><button class="btn primary" onclick="location.reload()">Muat ulang</button></div>';
    });
  }

  function loadMeta() {
    if (S.meta) return Promise.resolve(S.meta);
    var cached = safeJSON(sessionStorage.getItem('simtesis_meta'));
    if (cached) { S.meta = cached; api('meta').then(function (m) { S.meta = m; sessionStorage.setItem('simtesis_meta', JSON.stringify(m)); }).catch(function () {}); return Promise.resolve(cached); }
    return api('meta').then(function (m) { S.meta = m; sessionStorage.setItem('simtesis_meta', JSON.stringify(m)); return m; });
  }

  function renderTopbar(h) {
    var bar = $('#topbar');
    if (!S.token || !S.user) { bar.hidden = true; return; }
    bar.hidden = false;
    var items = {
      mahasiswa: [['#/', 'Progres Tesis'], ['#/akun', 'Akun']],
      dosen: [['#/', 'Mahasiswa Bimbingan'], ['#/akun', 'Akun']],
      admin: [['#/', 'Ringkasan'], ['#/pengguna', 'Pengguna'], ['#/akun', 'Akun']]
    }[S.user.role] || [];
    $('#nav').innerHTML = items.map(function (x) {
      var on = (x[0] === '#/' && (h === '#/' || h === '' || h.indexOf('#/tesis') === 0)) || (x[0] !== '#/' && h.indexOf(x[0]) === 0);
      return '<a href="' + x[0] + '" class="' + (on ? 'on' : '') + '">' + x[1] + '</a>';
    }).join('');
    $('#who').innerHTML = '<div class="name"><b>' + esc(S.user.nama) + '</b><small>' + esc(S.user.role === 'admin' ? 'Admin Prodi' : S.user.role) + ' · ' + esc(S.user.username) + '</small></div>' +
      '<button id="btnLogout">Keluar</button>';
    $('#btnLogout').onclick = function () { api('logout').catch(function () {}); clearSession(); go('#/login'); };
  }

  // ------------------------------------------------------------ auth views
  function authShell(inner) {
    return '<div class="auth-wrap"><div class="auth-hero">' +
      '<span class="eyebrow">MAGISTER TEKNIK SIPIL · FT UNIVERSITAS JANABADRA</span>' +
      '<h1>Pantau progres tesis, <span>dari judul sampai publikasi.</span></h1>' +
      '<p>Mahasiswa mengunggah berkas setiap tahap, dosen pembimbing memberi saran dan persetujuan, prodi melihat keseluruhan progres dalam satu dasbor.</p>' +
      '<div class="flow"><div>Seminar Judul</div><div>Proposal</div><div>Seminar Hasil</div><div>Naskah Tesis</div><div>Luaran Akhir</div></div>' +
      '</div><div class="card auth-card">' + inner + '</div></div>';
  }

  function viewLogin() {
    app.innerHTML = authShell(
      '<h2>Masuk</h2><p class="sub">Gunakan NIM (mahasiswa), username/NIDN (dosen), atau email.</p>' +
      '<form id="fLogin"><div class="field"><label class="f" for="lu">NIM / Username / Email</label><input type="text" id="lu" autocomplete="username" required></div>' +
      '<div class="field"><label class="f" for="lp">Password</label><input type="password" id="lp" autocomplete="current-password" required></div>' +
      '<button class="btn primary block" type="submit" data-busy="Masuk…">Masuk</button></form>' +
      '<p class="small muted" style="margin-top:18px">Mahasiswa baru? <a href="#/daftar"><b>Daftar akun</b></a><br>Akun dosen dibuatkan oleh admin prodi. Lupa password? Hubungi admin prodi untuk reset.</p>');
    $('#lu').focus();
    $('#fLogin').onsubmit = function (e) {
      e.preventDefault();
      busy(e.submitter || $('#fLogin button'), function () {
        return api('login', { username: $('#lu').value, password: $('#lp').value }).then(function (r) {
          saveSession(r.token, r.user); toast('Selamat datang, ' + r.user.nama, 'ok'); go('#/');
        });
      });
    };
  }

  function viewRegister() {
    var M = S.meta;
    app.innerHTML = authShell(
      '<h2>Daftar akun mahasiswa</h2><p class="sub">Data ini dipakai dosen pembimbing dan prodi untuk mengenali Anda.</p>' +
      '<form id="fReg"><div class="grid2"><div class="field"><label class="f">NIM</label><input type="text" name="username" required></div>' +
      '<div class="field"><label class="f">Angkatan</label><input type="text" name="angkatan" placeholder="2025"></div></div>' +
      '<div class="field"><label class="f">Nama lengkap</label><input type="text" name="nama" required></div>' +
      '<div class="grid2"><div class="field"><label class="f">Email</label><input type="email" name="email" required></div>' +
      '<div class="field"><label class="f">No. HP/WA</label><input type="text" name="hp"></div></div>' +
      '<div class="field"><label class="f">Konsentrasi</label><select name="konsentrasi">' + opt(M.konsentrasi, '', '— pilih —') + '</select></div>' +
      '<div class="grid2"><div class="field"><label class="f">Password</label><input type="password" name="password" minlength="8" required autocomplete="new-password"></div>' +
      '<div class="field"><label class="f">Ulangi password</label><input type="password" name="password2" minlength="8" required autocomplete="new-password"></div></div>' +
      '<button class="btn primary block" type="submit" data-busy="Mendaftar…">Daftar</button></form>' +
      '<p class="small muted" style="margin-top:16px">Sudah punya akun? <a href="#/login"><b>Masuk</b></a></p>');
    $('#fReg').onsubmit = function (e) {
      e.preventDefault();
      var d = formData(e.target);
      if (d.password !== d.password2) { toast('Password tidak sama.', 'err'); return; }
      busy($('#fReg button[type=submit]'), function () {
        return api('register', d).then(function (r) {
          if (r.perluVerifikasi) { toast('Pendaftaran berhasil. Akun akan aktif setelah diverifikasi admin prodi.', 'ok'); go('#/login'); return; }
          return api('login', { username: d.username, password: d.password }).then(function (x) {
            saveSession(x.token, x.user); toast('Akun dibuat. Silakan isi data tesis Anda.', 'ok'); go('#/');
          });
        });
      });
    };
  }

  function formData(form) {
    var o = {};
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return o;
  }

  // ------------------------------------------------------------ home
  function viewHome() {
    if (S.user.role === 'mahasiswa') return api('tesisSaya').then(function (D) { renderDetail(D); });
    if (S.user.role === 'dosen') return viewDosen();
    return viewAdmin();
  }

  function viewTesis(id) {
    if (S.user.role === 'mahasiswa') { go('#/'); return; }
    return api('detailTesis', { id: id }).then(function (D) { renderDetail(D); });
  }

  // ------------------------------------------------------------ detail tesis (semua peran)
  function docsFor(n, jalur) {
    var t = S.meta.tahap[n - 1];
    if (t.docs) return t.docs;
    return jalur === 'Publikasi' ? t.docsPublikasi : t.docsReguler;
  }

  function renderDetail(D) {
    S.D = D;
    var key = (D.tesis && D.tesis.id) || 'baru';
    var aktif = D.progres.aktif;
    if (S.openFor !== key) { S.openFor = key; S.open = new Set([Math.min(aktif, 5)]); }
    var M = S.meta, t = D.tesis, mhs = D.mahasiswa;
    var isM = D.akses === 'mahasiswa';
    var html = '';

    if (!isM) {
      html += '<div class="page-head"><div><a href="#/" class="small">← Kembali ke daftar</a></div>' +
        '<div class="small muted">Anda melihat sebagai <b>' + esc(PERAN[D.akses] || D.akses) + '</b></div></div>';
    }

    html += '<section class="card thesis-head">' +
      '<div class="kicker">' + esc(mhs.nama) + ' · NIM ' + esc(mhs.username) + (mhs.konsentrasi ? ' · ' + esc(mhs.konsentrasi) : '') + (mhs.angkatan ? ' · Angkatan ' + esc(mhs.angkatan) : '') + '</div>' +
      '<h1>' + (t && t.judul ? esc(t.judul) : '<span class="faint">Judul tesis belum diisi</span>') + '</h1>' +
      '<div class="meta-line">' + jalurChip(t && t.jalur) +
      '<span>Pembimbing 1: <b>' + namaDosen(D, D.p1, D.usul1) + '</b></span>' +
      '<span>Pembimbing 2: <b>' + namaDosen(D, D.p2, D.usul2) + '</b></span>' +
      (t && !D.p1 ? '<span class="chip s-MENUNGGU">Pembimbing menunggu penetapan prodi</span>' : '') +
      (mhs.email && !isM ? '<span>Kontak: <a href="mailto:' + esc(mhs.email) + '">' + esc(mhs.email) + '</a>' + (mhs.hp ? ' · ' + esc(mhs.hp) : '') + '</span>' : '') +
      '</div>' +
      '<div class="prog-big"><span class="small muted" style="font-weight:700">Progres</span><div class="bar-track"><div class="bar-fill" style="width:' + D.progres.persen + '%"></div></div><b>' + D.progres.persen + '%</b></div>' +
      '<div class="stepper">' + M.tahap.map(function (s, i) {
        var st = D.progres.tahap[i].status;
        var cls = st === 'SELESAI' ? 'done' : (i + 1 === aktif ? 'cur ' + st : 'lock');
        return '<button class="step ' + cls + '" data-step="' + s.no + '"><div class="n">' + (st === 'SELESAI' ? '✓' : s.no) + '</div><div class="nm">' + esc(s.nama) + '</div><div class="mk">' + esc(s.mk) + '</div></button>';
      }).join('') + '</div></section>';

    if (D.progres.selesai) html += '<div class="alert ok" style="margin-top:16px"><b>Seluruh tahapan tesis telah disetujui.</b> Luaran akhir sudah lengkap.</div>';
    else if (isM && !t) html += '<div class="alert info" style="margin-top:16px"><b>Langkah pertama:</b> isi judul tesis, pilih jalur, dan usulkan dosen pembimbing 1 & 2 pada Tahap 1 di bawah, lalu unggah bahan seminar judul. Program studi akan memberi saran/revisi dan menetapkan dosen pembimbing.</div>';

    html += '<div class="section-title">Tahapan tesis</div>';
    for (var n = 1; n <= 5; n++) html += stagePanel(D, n);

    app.innerHTML = html;
    bindDetail();
  }

  function decisionBox(label, dec) {
    return '<div class="appr"><span class="who-l">' + esc(label) + '</span>' +
      (dec ? '<span class="chip k-' + esc(dec.keputusan) + '">' + esc(dec.keputusan) + '</span><small>' + fmt(dec.waktu) + '</small>'
        : '<span class="chip s-BELUM">Belum ada keputusan</span>') + '</div>';
  }

  function stagePanel(D, n) {
    var M = S.meta, s = M.tahap[n - 1], P = D.progres.tahap[n - 1], t = D.tesis;
    var aktif = D.progres.aktif, st = P.status, open = S.open.has(n);
    var isM = D.akses === 'mahasiswa', isAdmin = D.akses === 'admin';
    var isDosen = D.akses === 'pembimbing1' || D.akses === 'pembimbing2';
    var unlocked = n <= aktif;

    var h = '<section class="card stage ' + st + (open ? ' open' : '') + '" id="stage-' + n + '">' +
      '<div class="stage-h" data-toggle="' + n + '"><div class="num">' + (st === 'SELESAI' ? '✓' : n) + '</div>' +
      '<div class="grow"><h3>' + esc(s.nama) + '</h3><div class="mk">' + esc(s.mk) + (n === 1 ? ' · diputuskan program studi' : '') + (P.revisiKe ? ' · ' + P.revisiKe + '× revisi' : '') + (P.tglSelesai ? ' · disetujui ' + fmtD(P.tglSelesai) : '') + '</div></div>' +
      chip(st, P.revisiKe) + '<span class="caret">▾</span></div><div class="stage-b">';

    h += '<p class="desc">' + esc(s.ket) + '</p>';

    if (!unlocked) {
      h += '<div class="alert info">Tahap ini terbuka setelah tahap sebelumnya disetujui' + (n === 2 ? ' program studi.' : ' pembimbing.') + '</div>';
      if (n === 5) h += publikasiSection(D);
      return h + '</div></section>';
    }

    var siapa = n === 1 ? 'Program studi' : 'Pembimbing';
    var revTxt = '<b>' + siapa + ' meminta revisi' + (P.revisiKe ? ' ke-' + P.revisiKe : '') + '.</b> ';
    if (n === aktif && P.syarat.length && t) {
      h += '<div class="alert ' + (st === 'REVISI' ? 'warn' : 'info') + '" style="margin-bottom:14px">' +
        (st === 'REVISI' ? revTxt + 'Unggah versi perbaikan, lalu ' + siapa.toLowerCase() + ' akan meninjau kembali.' : '<b>Yang perlu dilengkapi sebelum tahap ini dapat disetujui:</b>') +
        '<ul>' + P.syarat.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    } else if (st === 'REVISI') {
      h += '<div class="alert warn" style="margin-bottom:14px">' + revTxt + 'Baca saran di bawah, unggah versi perbaikan, lalu ' + siapa.toLowerCase() + ' akan meninjau kembali.</div>';
    } else if (st === 'MENUNGGU') {
      h += '<div class="alert info" style="margin-bottom:14px">Berkas sudah lengkap. <b>' + (n === 1 ? 'Menunggu keputusan program studi (seminar judul & penetapan pembimbing).' : 'Menunggu persetujuan dosen pembimbing.') + '</b>' +
        (P.revisiKe ? ' Perbaikan revisi ke-' + P.revisiKe + ' sudah diunggah.' : '') + '</div>';
    }
    if (n === 1 && isDosen) {
      h += '<div class="alert info" style="margin-bottom:14px">Seminar judul ditangani program studi. Saran/revisi prodi di bawah menjadi acuan bimbingan Anda.</div>';
    }

    if (t) {
      h += '<div class="approvals">' + (n === 1 ? decisionBox('Program Studi', P.admin) :
        decisionBox('Pembimbing 1' + (D.p1 ? ' · ' + D.p1.nama : ''), P.p1) +
        decisionBox('Pembimbing 2' + (D.p2 ? ' · ' + D.p2.nama : ''), P.p2) +
        (P.admin ? decisionBox('Prodi', P.admin) : '')) + '</div>';
    }

    if (n === 1 && (isM || isAdmin)) h += tesisForm(D);
    if (n === 5) h += publikasiSection(D);

    // berkas wajib mahasiswa
    if (n === 5 && !(t && t.jalur)) {
      h += '<div class="alert warn">Pilih jalur tesis terlebih dahulu (Tahap 1) untuk melihat berkas luaran yang diperlukan.</div>';
    } else {
      h += '<div class="sub-h">Berkas tahap ini</div><div class="docs">' +
        docsFor(n, t && t.jalur).map(function (d) { return docRow(D, n, d, isM && !!t); }).join('') + '</div>';
    }

    // berkas koreksi dosen
    var kor = D.berkas.filter(function (b) { return b.tahap === n && b.jenis === 'KOREKSI'; });
    if (kor.length || (isDosen && n > 1) || isAdmin) {
      h += '<div class="sub-h">Berkas koreksi dari ' + (n === 1 ? 'program studi' : 'pembimbing') + '</div><div class="docs">' +
        docRow(D, n, { jenis: 'KOREKSI', label: 'Naskah dengan catatan/coretan ' + (n === 1 ? 'prodi' : 'pembimbing'), wajib: false }, (isDosen && n > 1) || isAdmin) + '</div>';
    }

    // thread saran
    var notes = D.catatan.filter(function (c) { return c.tahap === n; });
    h += '<div class="sub-h">Saran & diskusi bimbingan <span class="faint small">(' + notes.length + ')</span></div>';
    h += notes.length ? '<div class="thread">' + notes.map(noteHtml).join('') + '</div>' : '<div class="small faint">Belum ada catatan pada tahap ini.</div>';

    if (t) {
      if (isM) {
        var ke = n === 1 ? 'program studi' : 'pembimbing';
        h += '<div class="compose"><textarea data-note="' + n + '" placeholder="Tulis tanggapan, pertanyaan, atau ringkasan perbaikan untuk ' + ke + '…"></textarea>' +
          '<div class="row"><span class="grow"></span><button class="btn primary sm" data-send="' + n + '" data-busy="Mengirim…">Kirim ke ' + ke + '</button></div></div>';
      } else if ((isDosen && n > 1) || isAdmin) {
        var canDecide = n === aktif;
        var nextRev = (P.revisiKe || 0) + (st === 'REVISI' ? 0 : 1);
        var tetap = '';
        if (n === 1 && isAdmin && canDecide) {
          var dOpt = (D.dosen || []).map(function (x) { return { v: x.id, l: x.nama }; });
          tetap = '<div class="form-box" style="margin:8px 0"><div class="small" style="font-weight:700;margin-bottom:8px">Penetapan dosen pembimbing (berlaku saat seminar judul disetujui)</div>' +
            '<div class="grid2"><div class="field"><label class="f">Pembimbing 1</label><select data-tetap="1">' + opt(dOpt, t.p1_id || t.usul_p1_id, '— pilih dosen —') + '</select>' +
            '<div class="hint">Usulan mahasiswa: ' + esc(D.usul1 ? D.usul1.nama : '-') + '</div></div>' +
            '<div class="field"><label class="f">Pembimbing 2</label><select data-tetap="2">' + opt(dOpt, t.p2_id || t.usul_p2_id, '— pilih dosen —') + '</select>' +
            '<div class="hint">Usulan mahasiswa: ' + esc(D.usul2 ? D.usul2.nama : '-') + '</div></div></div></div>';
        }
        h += '<div class="compose"><textarea data-note="' + n + '" placeholder="Tulis saran/arahan untuk mahasiswa…"></textarea>' + tetap +
          '<div class="row"><span class="small muted grow">' + (canDecide ? (n === 1 ? 'Setelah disetujui, kedua dosen pembimbing menerima notifikasi penetapan.' : (isAdmin ? 'Persetujuan prodi menyelesaikan tahap ini tanpa menunggu pembimbing.' : 'Tahap selesai bila kedua pembimbing menyetujui.')) : '') + '</span>' +
          '<button class="btn sm" data-send="' + n + '" data-busy="Mengirim…">Kirim saran</button>' +
          (canDecide ? '<button class="btn warn sm" data-decide="Revisi" data-n="' + n + '" data-busy="Menyimpan…">Minta revisi' + (st === 'REVISI' ? '' : ' (ke-' + nextRev + ')') + '</button>' +
            '<button class="btn ok sm" data-decide="Disetujui" data-n="' + n + '" data-busy="Menyimpan…">✓ ' + (n === 1 ? 'Setujui & tetapkan pembimbing' : 'Setujui tahap ini') + '</button>' : '') +
          '</div></div>';
      }
    }
    return h + '</div></section>';
  }

  function docRow(D, n, d, canUpload) {
    var list = D.berkas.filter(function (b) { return b.tahap === n && b.jenis === d.jenis; });
    var latest = list[list.length - 1];
    var key = n + '|' + d.jenis;
    var accept = S.meta.ekstensi.map(function (e) { return '.' + e; }).join(',');
    var h = '<div class="doc"><div><div class="dl">' + esc(d.label) + (d.wajib ? '<span class="req" title="wajib">*</span>' : '') + '</div>';
    if (latest) {
      h += '<div class="file"><span class="ok-ic">✓</span><a href="' + esc(safeUrl(latest.url)) + '" target="_blank" rel="noopener">' + esc(latest.nama) + '</a>' +
        (latest.perbaikanKe ? ' <span class="chip nodot s-REVISI">perbaikan revisi ke-' + latest.perbaikanKe + '</span>' : '') +
        '<span class="faint"> · ' + (fmtSize(latest.ukuran) ? fmtSize(latest.ukuran) + ' · ' : '') + esc(latest.oleh) + ', ' + fmt(latest.waktu) + '</span>' +
        (list.length > 1 ? ' · <button class="btn link small" data-hist="' + key + '">riwayat ' + list.length + ' versi</button>' : '') + '</div>';
    } else {
      h += '<div class="none">Belum diunggah</div>';
    }
    h += '</div><div>' + (canUpload ? '<button class="btn sm" data-open-up="' + key + '">⬆ ' + (latest ? 'Unggah versi baru' : 'Unggah') + '</button>' : '') + '</div>';
    if (list.length > 1) {
      h += '<div class="hist" data-hist-box="' + key + '" hidden>' + list.slice().reverse().map(function (b, i) {
        return '<div>v' + (list.length - i) + ' — <a href="' + esc(safeUrl(b.url)) + '" target="_blank" rel="noopener">' + esc(b.nama) + '</a> <span class="faint">· ' +
          (b.perbaikanKe ? '<b>perbaikan revisi ke-' + b.perbaikanKe + '</b> · ' : (b.peran === 'mahasiswa' ? 'pengajuan awal · ' : '')) + esc(b.oleh) + ', ' + fmt(b.waktu) + '</span></div>';
      }).join('') + '</div>';
    }
    if (canUpload) {
      h += '<div class="uploader" data-up="' + key + '"><input type="file" accept="' + accept + '">' +
        '<span class="or">ATAU</span><input type="url" placeholder="tempel tautan Google Drive / OneDrive (https://…)">' +
        '<button class="btn primary sm" data-do-up="' + key + '" data-busy="Mengunggah…">Kirim</button>' +
        '<button class="btn sm" data-cancel-up="' + key + '">Batal</button>' +
        '<div class="small faint" style="flex-basis:100%">Maks. ' + S.meta.maksMB + ' MB (' + esc(S.meta.ekstensi.join(', ')) + '). Berkas lebih besar: unggah ke Drive lalu tempel tautannya (atur akses "siapa saja yang memiliki link").</div></div>';
    }
    return h + '</div>';
  }

  function noteHtml(c) {
    var sys = /^\[Pembaruan\]/.test(c.isi);
    var cls = sys ? 'sys' : (c.peran === 'mahasiswa' ? 'mahasiswa' : 'dosen-like');
    return '<div class="msg ' + cls + '"><div class="mh"><b>' + esc(c.oleh) + '</b><span class="role-chip ' + esc(c.peran) + '">' + esc(PERAN[c.peran] || c.peran) + '</span>' +
      (c.keputusan ? '<span class="chip k-' + esc(c.keputusan) + '">' + esc(c.keputusan === 'Disetujui' ? (c.tahap === 1 ? 'Menyetujui & menetapkan pembimbing' : 'Menyetujui tahap') : 'Meminta revisi' + (c.revisiKe ? ' ke-' + c.revisiKe : '')) + '</span>' : '') +
      '<time>' + fmt(c.waktu) + '</time></div>' +
      (c.isi ? '<div class="mb">' + esc(sys ? c.isi.replace(/^\[Pembaruan\]\s*/, '') : c.isi) + '</div>' : '') + '</div>';
  }

  function jalurInfo(j) {
    if (j === 'Publikasi') return '<b>Jalur Publikasi:</b> luaran berupa artikel yang <b>accepted/terbit</b> di jurnal <b>SINTA 1–3 atau Scopus</b> (bukti LoA/DOI) — <b>tanpa</b> buku laporan tesis. Bila artikel masih <i>under review</i>, mahasiswa tetap menyusun laporan sampai berstatus accepted.';
    if (j === 'Reguler') return '<b>Jalur Reguler:</b> luaran berupa <b>buku laporan tesis</b> dan satu artikel <b>accepted/terbit</b> di jurnal <b>SINTA 4–6</b> (atau lebih tinggi).';
    return 'Pilih jalur untuk melihat ketentuan luaran.';
  }

  function tesisForm(D) {
    var t = D.tesis || {}, isAdmin = D.akses === 'admin';
    var dosen = D.dosen || [];
    var ditetapkan = D.progres.tahap[0].status === 'SELESAI';
    var dOpt = dosen.map(function (x) { return { v: x.id, l: x.nama }; });
    var pemb = '';
    if (isAdmin) {
      pemb = ditetapkan || t.p1_id
        ? '<div class="grid2"><div class="field"><label class="f">Dosen pembimbing 1 (ditetapkan prodi)</label><select name="p1_id">' + opt(dOpt, t.p1_id, '— pilih dosen —') + '</select></div>' +
          '<div class="field"><label class="f">Dosen pembimbing 2 (ditetapkan prodi)</label><select name="p2_id">' + opt(dOpt, t.p2_id, '— pilih dosen —') + '</select></div></div>' +
          '<div class="hint" style="margin:-6px 0 12px">Ubah hanya bila ada penggantian pembimbing; dosen baru akan menerima notifikasi.</div>'
        : '<div class="field"><label class="f">Usulan pembimbing dari mahasiswa</label>' + esc(D.usul1 ? D.usul1.nama : '-') + ' / ' + esc(D.usul2 ? D.usul2.nama : '-') +
          '<div class="hint">Penetapan pembimbing dilakukan saat menyetujui seminar judul (kotak keputusan di bawah).</div></div>';
    } else if (ditetapkan) {
      pemb = '<div class="field"><label class="f">Dosen pembimbing (ditetapkan program studi)</label>' +
        '1. ' + esc(D.p1 ? D.p1.nama : '-') + '<br>2. ' + esc(D.p2 ? D.p2.nama : '-') + '</div>';
    } else {
      pemb = '<div class="grid2"><div class="field"><label class="f">Usulan dosen pembimbing 1</label><select name="usul_p1_id">' + opt(dOpt, t.usul_p1_id, '— pilih dosen —') + '</select></div>' +
        '<div class="field"><label class="f">Usulan dosen pembimbing 2</label><select name="usul_p2_id">' + opt(dOpt, t.usul_p2_id, '— pilih dosen —') + '</select></div></div>' +
        '<div class="hint" style="margin:-6px 0 12px">Dosen pembimbing ditetapkan oleh program studi saat seminar judul disetujui; dapat berbeda dari usulan.</div>';
    }
    return '<div class="sub-h">Data tesis</div><form class="form-box" id="fTesis">' +
      '<div class="field"><label class="f">Judul tesis</label><textarea name="judul" rows="2" required>' + esc(t.judul || '') + '</textarea></div>' +
      '<div class="field"><label class="f">Jalur tesis</label><select name="jalur" id="selJalur">' + opt(S.meta.jalur, t.jalur, '— pilih jalur —') + '</select>' +
      '<div class="hint" id="jalurInfo">' + jalurInfo(t.jalur) + '</div></div>' + pemb +
      (!dosen.length ? '<div class="alert warn" style="margin-bottom:12px">Belum ada akun dosen aktif. Hubungi admin prodi.</div>' : '') +
      '<div class="row"><span class="grow small muted">' + (isAdmin ? 'Perubahan oleh prodi tercatat di riwayat bimbingan.' : (D.tesis ? 'Setiap perubahan tercatat di riwayat.' : '')) + '</span>' +
      '<button class="btn primary" type="submit" data-busy="Menyimpan…">' + (D.tesis ? 'Simpan perubahan' : 'Simpan & ajukan ke program studi') + '</button></div></form>';
  }

  function publikasiSection(D) {
    var p = D.publikasi || {}, t = D.tesis || {}, M = S.meta;
    var isM = D.akses === 'mahasiswa';
    var h = '<div class="sub-h">Data publikasi artikel</div>';
    var warn = [];
    if (p.jurnal) {
      if (t.jalur === 'Publikasi' && M.indeksPublikasi.indexOf(p.indeks) < 0) warn.push('Jalur Publikasi mensyaratkan jurnal SINTA 1–3 atau Scopus. Pertimbangkan pindah ke jalur Reguler bila jurnal tujuan SINTA 4–6.');
      if (t.jalur === 'Publikasi' && ['Submitted', 'Under Review', 'Revisi'].indexOf(p.status) >= 0) warn.push('Artikel belum accepted. Sesuai ketentuan prodi, mahasiswa tetap menyusun laporan tesis hingga artikel berstatus accepted.');
      if (p.status === 'Rejected') warn.push('Artikel ditolak. Perbarui data bila sudah dikirim ke jurnal lain.');
    }
    if (warn.length) h += '<div class="alert warn" style="margin-bottom:10px"><ul style="margin:0">' + warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';

    if (!isM) {
      if (!p.jurnal) return h + '<div class="small faint" style="margin-bottom:8px">Mahasiswa belum mengisi data publikasi.</div>';
      return h + '<div class="form-box"><div class="grid2 small">' +
        kv('Judul artikel', p.judul_artikel) + kv('Jurnal', p.jurnal + (p.issn ? ' (ISSN ' + p.issn + ')' : '')) +
        kv('Indeks', p.indeks) + kv('Status', p.status) + kv('Tanggal submit', p.tgl_submit ? fmtD(p.tgl_submit) : '-') +
        kv('Vol/No/Tahun', p.vol_no_thn) + kv('Peran penulis', p.peran_penulis) +
        '<div class="field"><label class="f">DOI / URL</label>' + (p.doi_url ? '<a href="' + esc(/^10\./.test(p.doi_url) ? 'https://doi.org/' + p.doi_url : safeUrl(p.doi_url)) + '" target="_blank" rel="noopener">' + esc(p.doi_url) + '</a>' : '-') + '</div>' +
        '</div><div class="small faint">Diperbarui ' + fmt(p.diperbarui) + '</div></div>';
    }
    if (!D.tesis) return h + '<div class="small faint">Simpan data tesis terlebih dahulu.</div>';
    return h + '<form class="form-box" id="fPub">' +
      '<div class="field"><label class="f">Judul artikel</label><input type="text" name="judul_artikel" value="' + esc(p.judul_artikel || '') + '"></div>' +
      '<div class="grid2"><div class="field"><label class="f">Nama jurnal</label><input type="text" name="jurnal" value="' + esc(p.jurnal || '') + '" required></div>' +
      '<div class="field"><label class="f">ISSN / e-ISSN</label><input type="text" name="issn" value="' + esc(p.issn || '') + '"></div></div>' +
      '<div class="grid3"><div class="field"><label class="f">Indeks jurnal</label><select name="indeks">' + opt(M.indeks, p.indeks, '— pilih —') + '</select></div>' +
      '<div class="field"><label class="f">Status artikel</label><select name="status">' + opt(M.statusPublikasi, p.status, '— pilih —') + '</select></div>' +
      '<div class="field"><label class="f">Tanggal submit</label><input type="date" name="tgl_submit" value="' + esc(p.tgl_submit || '') + '"></div></div>' +
      '<div class="grid3"><div class="field"><label class="f">DOI / URL artikel</label><input type="text" name="doi_url" value="' + esc(p.doi_url || '') + '" placeholder="10.xxxx/… atau https://…"></div>' +
      '<div class="field"><label class="f">Vol / No / Tahun</label><input type="text" name="vol_no_thn" value="' + esc(p.vol_no_thn || '') + '" placeholder="Vol. 12 No. 2 (2026)"></div>' +
      '<div class="field"><label class="f">Peran penulis</label><select name="peran_penulis">' + opt(['Penulis pertama', 'Corresponding author', 'Penulis anggota'], p.peran_penulis, '— pilih —') + '</select></div></div>' +
      '<div class="row"><span class="grow small muted">' + (p.diperbarui ? 'Terakhir diperbarui ' + fmt(p.diperbarui) + '. ' : '') + 'Perubahan status tercatat di riwayat bimbingan.</span>' +
      '<button class="btn primary" type="submit" data-busy="Menyimpan…">Simpan data publikasi</button></div></form>';
  }
  function kv(k, v) { return '<div class="field"><label class="f">' + esc(k) + '</label>' + esc(v || '-') + '</div>'; }

  function readFileB64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(new Error('Gagal membaca berkas.')); };
      r.readAsDataURL(file);
    });
  }

  function bindDetail() {
    var D = S.D;
    var after = function (msg) { return function (nd) { renderDetail(nd); if (msg) toast(msg, 'ok'); }; };

    app.onclick = function (e) {
      var el = e.target.closest('[data-toggle],[data-step],[data-open-up],[data-cancel-up],[data-do-up],[data-hist],[data-send],[data-decide]');
      if (!el) return;
      var ds = el.dataset;
      if (ds.toggle) {
        var n = Number(ds.toggle);
        if (S.open.has(n)) S.open.delete(n); else S.open.add(n);
        $('#stage-' + n).classList.toggle('open');
      } else if (ds.step) {
        var k = Number(ds.step); S.open.add(k);
        var sec = $('#stage-' + k); sec.classList.add('open'); sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (ds.openUp) {
        $('[data-up="' + ds.openUp + '"]').classList.add('show');
      } else if (ds.cancelUp) {
        $('[data-up="' + ds.cancelUp + '"]').classList.remove('show');
      } else if (ds.hist) {
        var hb = $('[data-hist-box="' + ds.hist + '"]'); hb.hidden = !hb.hidden;
      } else if (ds.doUp) {
        var box = $('[data-up="' + ds.doUp + '"]');
        var parts = ds.doUp.split('|');
        var file = $('input[type=file]', box).files[0];
        var url = $('input[type=url]', box).value.trim();
        if (!file && !url) { toast('Pilih berkas atau tempel tautan.', 'err'); return; }
        if (file && file.size > S.meta.maksMB * 1048576) { toast('Ukuran berkas melebihi ' + S.meta.maksMB + ' MB. Unggah ke Google Drive lalu tempel tautannya.', 'err'); return; }
        busy(el, function () {
          var base = { tesis_id: D.tesis && D.tesis.id, tahap: Number(parts[0]), jenis: parts[1] };
          var p = file ? readFileB64(file).then(function (b64) { base.nama = file.name; base.mime = file.type; base.base64 = b64; return base; })
            : Promise.resolve(Object.assign(base, { url: url }));
          return p.then(function (d) { return api('unggah', d); }).then(after('Berkas berhasil diunggah.'));
        });
      } else if (ds.send) {
        var ta = $('textarea[data-note="' + ds.send + '"]');
        if (!ta.value.trim()) { toast('Tulis catatan terlebih dahulu.', 'err'); ta.focus(); return; }
        busy(el, function () {
          return api('catatan', { tesis_id: D.tesis.id, tahap: Number(ds.send), isi: ta.value }).then(after('Catatan terkirim.'));
        });
      } else if (ds.decide) {
        var n2 = ds.n, ta2 = $('textarea[data-note="' + n2 + '"]');
        if (ds.decide === 'Revisi' && !ta2.value.trim()) { toast('Tuliskan arahan revisi di kotak saran.', 'err'); ta2.focus(); return; }
        var extra = {};
        if (ds.decide === 'Disetujui' && n2 === '1') {
          var s1 = $('select[data-tetap="1"]'), s2 = $('select[data-tetap="2"]');
          if (!s1.value || !s2.value) { toast('Tetapkan dosen pembimbing 1 dan 2.', 'err'); return; }
          if (s1.value === s2.value) { toast('Pembimbing 1 dan 2 harus berbeda.', 'err'); return; }
          extra = { p1_id: s1.value, p2_id: s2.value };
          if (!confirm('Setujui seminar judul ' + D.mahasiswa.nama + ' dan tetapkan:\n1. ' + s1.selectedOptions[0].text + '\n2. ' + s2.selectedOptions[0].text + '\n\nKedua dosen akan menerima notifikasi.')) return;
        } else if (ds.decide === 'Disetujui' && !confirm('Setujui tahap "' + stageName(Number(n2)) + '" untuk ' + D.mahasiswa.nama + '?')) return;
        busy(el, function () {
          return api('keputusan', Object.assign({ tesis_id: D.tesis.id, tahap: Number(n2), keputusan: ds.decide, isi: ta2.value }, extra))
            .then(after(ds.decide === 'Disetujui' ? (n2 === '1' ? 'Seminar judul disetujui; pembimbing ditetapkan dan diberi notifikasi.' : 'Tahap disetujui.') : 'Permintaan revisi terkirim.'));
        });
      }
    };

    app.onchange = function (e) {
      if (e.target.id === 'selJalur') $('#jalurInfo').innerHTML = jalurInfo(e.target.value);
    };

    app.onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, btn = $('button[type=submit]', f), d = formData(f);
      if (f.id === 'fTesis') {
        var sel = $$('select[disabled]', f);
        sel.forEach(function (s) { d[s.name] = s.value; });
        busy(btn, function () {
          if (D.akses === 'admin') return api('adminUbahTesis', Object.assign({ id: D.tesis.id }, d)).then(after('Data tesis diperbarui.'));
          return api('simpanTesis', d).then(after(D.tesis ? 'Perubahan disimpan.' : 'Data tesis tersimpan dan diajukan ke program studi.'));
        });
      } else if (f.id === 'fPub') {
        busy(btn, function () { return api('simpanPublikasi', d).then(after('Data publikasi disimpan.')); });
      }
    };
  }

  // ------------------------------------------------------------ dosen
  function viewDosen() {
    return api('bimbingan').then(function (L) {
      var perlu = L.filter(function (x) { return x.perluTinjau; }).length;
      var menunggu = L.filter(function (x) { return x.statusAktif === 'MENUNGGU'; }).length;
      var lulus = L.filter(function (x) { return x.selesai; }).length;
      var baru = L.filter(function (x) { return x.baru; });
      app.innerHTML = '<div class="page-head"><div><h1>Mahasiswa bimbingan</h1><p>Mahasiswa yang ditetapkan program studi kepada Anda sebagai pembimbing 1 atau 2.</p></div></div>' +
        (baru.length ? '<div class="alert info" style="margin-bottom:16px"><b>' + baru.length + ' mahasiswa baru ditetapkan kepada Anda:</b> ' +
          baru.slice(0, 5).map(function (x) { return esc(x.nama) + ' (' + esc(x.peran) + ')'; }).join(', ') + (baru.length > 5 ? ', dan ' + (baru.length - 5) + ' lainnya' : '') +
          '. Buka masing-masing untuk membaca arahan program studi pada seminar judul; penanda "Baru ditetapkan" hilang setelah dibuka.</div>' : '') +
        '<div class="stats">' + stat(L.length, 'Total bimbingan', true) + stat(perlu, 'Ada aktivitas baru') + stat(menunggu, 'Menunggu persetujuan') + stat(lulus, 'Selesai semua tahap') + '</div>' +
        '<div class="section-title">Daftar</div><div class="card">' +
        '<div class="toolbar"><input type="search" id="q" placeholder="Cari nama, NIM, atau judul…">' +
        '<select id="fTahap">' + opt([{ v: '', l: 'Semua tahap' }].concat(S.meta.tahap.map(function (s) { return { v: s.no, l: s.no + '. ' + s.nama }; })).concat([{ v: '6', l: 'Selesai' }])) + '</select>' +
        '<select id="fPeran">' + opt(['', 'Pembimbing 1', 'Pembimbing 2'].map(function (x) { return { v: x, l: x || 'Semua peran' }; })) + '</select>' +
        '<label class="row small" style="gap:6px"><input type="checkbox" id="fPerlu"> Hanya yang ada aktivitas baru</label></div>' +
        '<div class="table-wrap" id="tbl"></div></div>';
      var draw = function () {
        var q = $('#q').value.toLowerCase(), ft = $('#fTahap').value, fp = $('#fPeran').value, fn = $('#fPerlu').checked;
        var rows = L.filter(function (r) {
          return (!q || (r.nama + ' ' + r.nim + ' ' + r.judul).toLowerCase().indexOf(q) >= 0) &&
            (!ft || String(r.tahapAktif) === ft) && (!fp || r.peran === fp) && (!fn || r.perluTinjau);
        });
        $('#tbl').innerHTML = rows.length ? studentTable(rows, true) : '<div class="empty">' + (L.length ? 'Tidak ada yang cocok dengan filter.' : 'Belum ada mahasiswa yang memilih Anda sebagai pembimbing.') + '</div>';
      };
      app.oninput = draw; app.onchange = function (e) { if (e.target.type !== 'search') draw(); };
      app.onclick = rowClick;
      draw();
    });
  }

  function stat(v, l, hl) { return '<div class="card stat' + (hl ? ' hl' : '') + '"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>'; }

  function studentTable(rows, dosenView) {
    return '<table class="t"><thead><tr><th>Mahasiswa</th><th>Judul & jalur</th>' + (dosenView ? '<th>Peran Anda</th>' : '<th>Pembimbing</th>') +
      '<th>Tahap saat ini</th><th>Progres</th><th>Aktivitas</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr class="click" data-id="' + esc(r.id) + '"><td><b>' + (r.perluTinjau ? '<span class="dot-new" title="' + (dosenView ? 'Ada aktivitas baru' : 'Perlu keputusan/tindak lanjut prodi') + '"></span>' : '') + esc(r.nama) + '</b>' +
          (dosenView && r.baru ? ' <span class="chip nodot s-MENUNGGU">Baru ditetapkan</span>' : '') + '<div class="small muted">' + esc(r.nim) + (r.angkatan ? ' · ' + esc(r.angkatan) : '') + '</div></td>' +
          '<td class="judul"><b>' + (r.judul ? esc(r.judul) : '<span class="faint">—</span>') + '</b>' + (r.jalur ? '<span class="chip nodot j-' + esc(r.jalur) + '" style="margin-top:4px">' + esc(r.jalur) + '</span>' : '') +
          (r.statusPublikasi ? ' <span class="small muted">· ' + esc(r.statusPublikasi) + (r.indeks ? ' (' + esc(r.indeks) + ')' : '') + '</span>' : '') + '</td>' +
          (dosenView ? '<td class="small">' + esc(r.peran) + '</td>' : '<td class="small">' + (r.p1 ? esc(r.p1) + '<br><span class="muted">' + esc(r.p2 || '') + '</span>'
            : (r.usul1 ? '<span class="faint">Usulan:</span> ' + esc(r.usul1) + '<br><span class="faint">' + esc(r.usul2 || '') + '</span>' : '<span class="faint">—</span>')) + '</td>') +
          '<td>' + (r.tahapAktif >= 1 && r.tahapAktif <= 5 ? '<div class="small" style="font-weight:700;margin-bottom:3px">' + r.tahapAktif + '. ' + esc(stageName(r.tahapAktif)) + '</div>' : '') + chip(r.statusAktif, r.revisiKe) + '</td>' +
          '<td class="mini-prog"><div class="bar-track"><div class="bar-fill" style="width:' + r.persen + '%"></div></div><small>' + r.persen + '%</small></td>' +
          '<td class="small muted">' + (r.aktivitas ? fmt(r.aktivitas) : '-') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function rowClick(e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (!tr.dataset.id) { toast('Mahasiswa ini belum mengisi data tesis.'); return; }
    go('#/tesis/' + tr.dataset.id);
  }

  // ------------------------------------------------------------ admin
  function viewAdmin() {
    return api('adminRingkasan').then(function (R) {
      var L = R.mahasiswa, M = S.meta;
      var belum = L.filter(function (r) { return !r.id; }).length;
      var lulus = L.filter(function (r) { return r.selesai; }).length;
      var jalan = L.length - belum - lulus;
      var keputusan = L.filter(function (r) { return r.perluTinjau; }).length;
      var dist = [{ l: 'Belum mengisi', v: belum }].concat(M.tahap.map(function (s) {
        return { l: s.no + '. ' + s.nama, v: L.filter(function (r) { return r.id && r.tahapAktif === s.no; }).length };
      })).concat([{ l: 'Selesai', v: lulus }]);
      var jal = M.jalur.map(function (j) { return { l: 'Jalur ' + j, v: L.filter(function (r) { return r.jalur === j; }).length }; });
      var pubs = M.statusPublikasi.map(function (s) { return { l: s, v: L.filter(function (r) { return r.statusPublikasi === s; }).length }; }).filter(function (x) { return x.v; });

      app.innerHTML = '<div class="page-head"><div><h1>Ringkasan progres tesis</h1><p>' + esc(M.prodi) + '</p></div>' +
        '<button class="btn" id="btnCsv">⬇ Unduh CSV</button></div>' +
        '<div class="stats">' + stat(L.length, 'Mahasiswa terdaftar', true) + stat(keputusan, 'Seminar judul perlu tindak lanjut prodi') + stat(jalan, 'Sedang berjalan') + stat(lulus, 'Selesai semua tahap') + '</div>' +
        '<div class="grid2" style="gap:16px;margin-top:16px">' +
        '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Sebaran tahap saat ini</h3>' + bars(dist) + '</div>' +
        '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Jalur tesis</h3>' + bars(jal) +
        '<h3 style="font-size:15px;margin:20px 0 14px">Status publikasi</h3>' + (pubs.length ? bars(pubs) : '<div class="small faint">Belum ada data publikasi.</div>') + '</div></div>' +
        '<div class="section-title">Beban bimbingan dosen</div><div class="card table-wrap">' +
        (R.beban.length ? '<table class="t"><thead><tr><th>Dosen</th><th>Pembimbing 1</th><th>Pembimbing 2</th><th>Total</th><th>Selesai</th></tr></thead><tbody>' +
          R.beban.map(function (b) { return '<tr><td><b>' + esc(b.nama) + '</b>' + (b.aktif ? '' : ' <span class="chip s-BELUM">nonaktif</span>') + '</td><td>' + b.p1 + '</td><td>' + b.p2 + '</td><td><b>' + (b.p1 + b.p2) + '</b></td><td>' + b.selesai + '</td></tr>'; }).join('') +
          '</tbody></table>' : '<div class="empty">Belum ada akun dosen. Tambahkan di menu <a href="#/pengguna">Pengguna</a>.</div>') + '</div>' +
        '<div class="section-title">Seluruh mahasiswa</div><div class="card">' +
        '<div class="toolbar"><input type="search" id="q" placeholder="Cari nama, NIM, judul, pembimbing…">' +
        '<select id="fTahap">' + opt([{ v: '', l: 'Semua tahap' }, { v: '0', l: 'Belum mengisi' }].concat(M.tahap.map(function (s) { return { v: s.no, l: s.no + '. ' + s.nama }; })).concat([{ v: '6', l: 'Selesai' }])) + '</select>' +
        '<select id="fJalur">' + opt([{ v: '', l: 'Semua jalur' }].concat(M.jalur.map(function (j) { return { v: j, l: j }; }))) + '</select>' +
        '<select id="fKons">' + opt([{ v: '', l: 'Semua konsentrasi' }].concat(M.konsentrasi.map(function (j) { return { v: j, l: j }; }))) + '</select>' +
        '<label class="row small" style="gap:6px"><input type="checkbox" id="fPerlu"> Perlu tindak lanjut prodi</label>' +
        '</div><div class="table-wrap" id="tbl"></div></div>';

      var filtered = L;
      var draw = function () {
        var q = $('#q').value.toLowerCase(), ft = $('#fTahap').value, fj = $('#fJalur').value, fk = $('#fKons').value, fp = $('#fPerlu').checked;
        filtered = L.filter(function (r) {
          return (!q || [r.nama, r.nim, r.judul, r.p1, r.p2].join(' ').toLowerCase().indexOf(q) >= 0) &&
            (!ft || String(r.tahapAktif) === ft) && (!fj || r.jalur === fj) && (!fk || r.konsentrasi === fk) && (!fp || r.perluTinjau);
        }).sort(function (a, b) { return (b.perluTinjau - a.perluTinjau); });
        $('#tbl').innerHTML = filtered.length ? studentTable(filtered, false) : '<div class="empty">Tidak ada data.</div>';
      };
      app.oninput = draw; app.onchange = function (e) { if (e.target.type !== 'search') draw(); };
      app.onclick = function (e) {
        if (e.target.closest('#btnCsv')) { exportCsv(filtered); return; }
        rowClick(e);
      };
      draw();
    });
  }

  function bars(list) {
    var max = Math.max.apply(null, list.map(function (x) { return x.v; }).concat([1]));
    return '<div class="bars">' + list.map(function (x) {
      return '<div class="bar-row"><span>' + esc(x.l) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (x.v * 100 / max) + '%"></div></div><b>' + x.v + '</b></div>';
    }).join('') + '</div>';
  }

  function exportCsv(rows) {
    var head = ['NIM', 'Nama', 'Konsentrasi', 'Angkatan', 'Judul', 'Jalur', 'Pembimbing 1', 'Pembimbing 2', 'Tahap', 'Status', 'Progres (%)', 'Status publikasi', 'Jurnal', 'Indeks', 'Aktivitas terakhir'];
    var q = function (v) { v = String(v === null || v === undefined ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var lines = [head.map(q).join(',')].concat(rows.map(function (r) {
      return [r.nim, r.nama, r.konsentrasi, r.angkatan, r.judul, r.jalur, r.p1, r.p2,
        r.tahapAktif >= 1 && r.tahapAktif <= 5 ? r.tahapAktif + '. ' + stageName(r.tahapAktif) : (r.selesai ? 'Selesai' : '-'),
        (r.statusAktif === 'REVISI' && r.revisiKe ? 'Perlu revisi ke-' + r.revisiKe : (STATUS[r.statusAktif] || r.statusAktif)), r.persen, r.statusPublikasi, r.jurnal, r.indeks, r.aktivitas ? fmt(r.aktivitas) : ''].map(q).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'progres-tesis-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------ admin: pengguna
  function viewUsers() {
    return api('adminRingkasan').then(function (R) {
      var U = R.users;
      app.innerHTML = '<div class="page-head"><div><h1>Pengguna</h1><p>Kelola akun dosen, admin, dan mahasiswa. Akun dosen hanya dapat dibuat di sini.</p></div>' +
        '<button class="btn primary" id="btnAdd">+ Tambah pengguna</button></div>' +
        '<div class="card"><div class="toolbar"><input type="search" id="q" placeholder="Cari nama, username, email…">' +
        '<select id="fRole">' + opt([{ v: '', l: 'Semua peran' }, { v: 'dosen', l: 'Dosen' }, { v: 'mahasiswa', l: 'Mahasiswa' }, { v: 'admin', l: 'Admin' }]) + '</select>' +
        '<select id="fAktif">' + opt([{ v: '', l: 'Semua status' }, { v: '1', l: 'Aktif' }, { v: '0', l: 'Nonaktif / menunggu verifikasi' }]) + '</select></div>' +
        '<div class="table-wrap" id="tbl"></div></div>';
      var draw = function () {
        var q = $('#q').value.toLowerCase(), fr = $('#fRole').value, fa = $('#fAktif').value;
        var rows = U.filter(function (u) {
          return (!q || [u.nama, u.username, u.email].join(' ').toLowerCase().indexOf(q) >= 0) && (!fr || u.role === fr) &&
            (!fa || (fa === '1') === !!u.aktif);
        }).sort(function (a, b) { return (a.role + a.nama).localeCompare(b.role + b.nama); });
        $('#tbl').innerHTML = rows.length ? '<table class="t"><thead><tr><th>Nama</th><th>Username / NIM</th><th>Peran</th><th>Email / HP</th><th>Status</th><th></th></tr></thead><tbody>' +
          rows.map(function (u) {
            return '<tr><td><b>' + esc(u.nama) + '</b>' + (u.konsentrasi ? '<div class="small muted">' + esc(u.konsentrasi) + (u.angkatan ? ' · ' + esc(u.angkatan) : '') + '</div>' : '') + '</td>' +
              '<td>' + esc(u.username) + '</td><td><span class="role-chip ' + esc(u.role) + '">' + esc(u.role) + '</span></td>' +
              '<td class="small">' + esc(u.email || '-') + '<br><span class="muted">' + esc(u.hp || '') + '</span></td>' +
              '<td>' + (u.aktif ? '<span class="chip s-SELESAI">Aktif</span>' : '<span class="chip s-BELUM">Nonaktif</span>') + '</td>' +
              '<td style="white-space:nowrap"><button class="btn sm" data-edit="' + esc(u.id) + '">Ubah</button> <button class="btn sm" data-reset="' + esc(u.id) + '">Reset password</button></td></tr>';
          }).join('') + '</tbody></table>' : '<div class="empty">Tidak ada data.</div>';
      };
      app.oninput = draw; app.onchange = function (e) { if (e.target.type !== 'search') draw(); };
      app.onclick = function (e) {
        if (e.target.closest('#btnAdd')) userModal(null);
        var ed = e.target.closest('[data-edit]'); if (ed) userModal(U.filter(function (u) { return u.id === ed.dataset.edit; })[0]);
        var rs = e.target.closest('[data-reset]'); if (rs) resetModal(U.filter(function (u) { return u.id === rs.dataset.reset; })[0]);
      };
      draw();
    });
  }

  function modal(html, onSubmit) {
    var m = $('#modal');
    m.innerHTML = '<div class="card box">' + html + '</div>';
    m.hidden = false;
    var close = function () { m.hidden = true; m.innerHTML = ''; };
    m.onclick = function (e) { if (e.target === m || e.target.closest('[data-close]')) close(); };
    var f = $('form', m);
    if (f) f.onsubmit = function (e) {
      e.preventDefault();
      busy($('button[type=submit]', f), function () { return onSubmit(formData(f)).then(close); });
    };
    var first = $('input,select', m); if (first) first.focus();
  }

  function userModal(u) {
    var M = S.meta, isNew = !u; u = u || { role: 'dosen', aktif: true };
    modal('<h3>' + (isNew ? 'Tambah pengguna' : 'Ubah pengguna') + '</h3><form>' +
      '<div class="grid2"><div class="field"><label class="f">Peran</label><select name="role">' + opt([{ v: 'dosen', l: 'Dosen' }, { v: 'mahasiswa', l: 'Mahasiswa' }, { v: 'admin', l: 'Admin prodi' }], u.role) + '</select></div>' +
      '<div class="field"><label class="f">Username / NIM / NIDN</label><input type="text" name="username" value="' + esc(u.username || '') + '" required></div></div>' +
      '<div class="field"><label class="f">Nama lengkap (dengan gelar)</label><input type="text" name="nama" value="' + esc(u.nama || '') + '" required></div>' +
      '<div class="grid2"><div class="field"><label class="f">Email</label><input type="email" name="email" value="' + esc(u.email || '') + '"><div class="hint">Untuk notifikasi email.</div></div>' +
      '<div class="field"><label class="f">No. HP</label><input type="text" name="hp" value="' + esc(u.hp || '') + '"></div></div>' +
      '<div class="grid2"><div class="field"><label class="f">Konsentrasi</label><select name="konsentrasi">' + opt(M.konsentrasi, u.konsentrasi, '—') + '</select></div>' +
      '<div class="field"><label class="f">Angkatan (mahasiswa)</label><input type="text" name="angkatan" value="' + esc(u.angkatan || '') + '"></div></div>' +
      (isNew ? '<div class="field"><label class="f">Password awal</label><input type="text" name="password" minlength="8" required><div class="hint">Minimal 8 karakter. Sampaikan ke pengguna dan minta diganti setelah login.</div></div>' : '') +
      '<label class="row small" style="gap:8px;margin-bottom:16px"><input type="checkbox" name="aktif"' + (u.aktif ? ' checked' : '') + '> Akun aktif</label>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Batal</button><button type="submit" class="btn primary" data-busy="Menyimpan…">Simpan</button></div></form>',
      function (d) {
        d.id = u.id || '';
        return api('adminSimpanUser', d).then(function () { toast('Pengguna disimpan.', 'ok'); router(); });
      });
  }

  function resetModal(u) {
    modal('<h3>Reset password</h3><p class="muted small">Untuk <b>' + esc(u.nama) + '</b> (' + esc(u.username) + ').</p><form>' +
      '<div class="field"><label class="f">Password baru</label><input type="text" name="password" minlength="8" required></div>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Batal</button><button type="submit" class="btn primary" data-busy="Menyimpan…">Reset</button></div></form>',
      function (d) { return api('adminResetPassword', { id: u.id, password: d.password }).then(function () { toast('Password direset. Sampaikan ke pengguna.', 'ok'); }); });
  }

  // ------------------------------------------------------------ akun
  function viewAkun() {
    var u = S.user, M = S.meta;
    app.innerHTML = '<div class="page-head"><div><h1>Akun saya</h1><p>Perbarui profil dan password.</p></div></div>' +
      '<div class="grid2" style="gap:16px;align-items:start">' +
      '<form class="card pad" id="fProf"><h3 style="font-size:16px;margin-bottom:14px">Profil</h3>' +
      '<div class="field"><label class="f">Username / NIM</label><input type="text" value="' + esc(u.username) + '" disabled></div>' +
      '<div class="field"><label class="f">Nama lengkap</label><input type="text" name="nama" value="' + esc(u.nama) + '" required></div>' +
      '<div class="grid2"><div class="field"><label class="f">Email</label><input type="email" name="email" value="' + esc(u.email || '') + '"></div>' +
      '<div class="field"><label class="f">No. HP</label><input type="text" name="hp" value="' + esc(u.hp || '') + '"></div></div>' +
      (u.role === 'mahasiswa' ? '<div class="grid2"><div class="field"><label class="f">Konsentrasi</label><select name="konsentrasi">' + opt(M.konsentrasi, u.konsentrasi, '—') + '</select></div>' +
        '<div class="field"><label class="f">Angkatan</label><input type="text" name="angkatan" value="' + esc(u.angkatan || '') + '"></div></div>' : '') +
      '<button class="btn primary" type="submit" data-busy="Menyimpan…">Simpan profil</button></form>' +
      '<form class="card pad" id="fPw"><h3 style="font-size:16px;margin-bottom:14px">Ganti password</h3>' +
      '<div class="field"><label class="f">Password lama</label><input type="password" name="lama" required autocomplete="current-password"></div>' +
      '<div class="field"><label class="f">Password baru</label><input type="password" name="baru" minlength="8" required autocomplete="new-password"></div>' +
      '<div class="field"><label class="f">Ulangi password baru</label><input type="password" name="baru2" minlength="8" required autocomplete="new-password"></div>' +
      '<button class="btn primary" type="submit" data-busy="Menyimpan…">Ganti password</button></form></div>';
    app.onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, d = formData(f), btn = $('button[type=submit]', f);
      if (f.id === 'fProf') {
        if (u.role !== 'mahasiswa') { d.konsentrasi = u.konsentrasi || ''; d.angkatan = u.angkatan || ''; }
        busy(btn, function () { return api('simpanProfil', d).then(function (nu) { saveSession(S.token, nu); renderTopbar(location.hash); toast('Profil disimpan.', 'ok'); }); });
      } else {
        if (d.baru !== d.baru2) { toast('Password baru tidak sama.', 'err'); return; }
        busy(btn, function () { return api('gantiPassword', d).then(function () { f.reset(); toast('Password berhasil diganti.', 'ok'); }); });
      }
    };
  }

  window.addEventListener('hashchange', router);
  router();
})();
