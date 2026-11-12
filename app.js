import { GitHub } from './lib/github.js';
import {
	leggiFrontmatter, corpo, candidata, progettoDi, notaPrincipale, nomeNota, richiesti,
	applicaVoto, rigaRegistro, aggiornaStato, linkTabella, repoRegistrate, wikilinkInMarkdown,
	cella, progettoDellaRepo, progettiToccati, descriviPush, NOTA_REVISIONI, notaRevisioniVuota,
} from './lib/approva.js';

const vista = document.getElementById('vista');
const CHIAVE_CONF = 'bm-mobile-config';
const CHIAVE_CACHE = 'bm-mobile-fm';
const PREDEFINITI = { token: '', nome: 'Andrea Bianchini', proprietario: 'Lisard95', vault: 'light-blue-labs', branch: 'main' };

// --- archivio locale (può mancare: finestra privata, dati cancellati) ---
function leggi(chiave, def) {
	try { return JSON.parse(localStorage.getItem(chiave)) ?? def; } catch { return def; }
}
function salva(chiave, v) {
	try { localStorage.setItem(chiave, JSON.stringify(v)); } catch { /* niente archivio: si rilegge da GitHub */ }
}
const conf = () => ({ ...PREDEFINITI, ...leggi(CHIAVE_CONF, {}) });
const gh = () => new GitHub(conf());

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const classeStato = (s) => String(s ?? '').replace(/\s+/g, '-');
const oggi = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-GG nell'ora locale
const quando = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let timerAvviso;
function avviso(testo, errore = false) {
	const el = document.getElementById('avviso');
	el.textContent = testo;
	el.className = errore ? 'errore' : '';
	el.hidden = false;
	clearTimeout(timerAvviso);
	timerAvviso = setTimeout(() => { el.hidden = true; }, errore ? 8000 : 4000);
}

// --- indice delle note con approvazione ---
let indice = null; // { testa, percorsi:Set, note:[{ path, fm, tipo }] }

async function caricaIndice(forza = false) {
	if (indice && !forza) return indice;
	const g = gh();
	const testa = await g.testa();
	const file = await g.albero(testa);
	const percorsi = new Set(file.map((f) => f.path));
	const cand = file.filter((f) => candidata(f.path));
	const cache = leggi(CHIAVE_CACHE, {});
	const mancanti = cand.filter((f) => !(f.sha in cache)).map((f) => f.sha);
	if (mancanti.length) {
		const testi = await g.blob(mancanti);
		for (const [sha, t] of Object.entries(testi)) {
			const fm = leggiFrontmatter(t);
			cache[sha] = {
				approvazione: fm.approvazione ?? null, approvata_da: fm.approvata_da ?? [], respinta_da: fm.respinta_da ?? [],
				approvatori: fm.approvatori ?? null, tipo: fm.tipo ?? null, data_approvazione: fm.data_approvazione ?? null,
			};
		}
	}
	const vivi = {};
	for (const f of cand) vivi[f.sha] = cache[f.sha];
	salva(CHIAVE_CACHE, vivi);
	const perPercorso = Object.fromEntries(cand.map((f) => [f.path, vivi[f.sha]]));
	const note = cand
		.filter((f) => vivi[f.sha]?.approvazione)
		.map((f) => ({ path: f.path, fm: vivi[f.sha], tipo: perPercorso[notaPrincipale(progettoDi(f.path))]?.tipo ?? 'gioco' }));
	indice = { testa, percorsi, note };
	return indice;
}

function persone(fm, tipo) {
	const req = richiesti(fm, tipo);
	const si = new Set(fm.approvata_da ?? []);
	const no = new Set(fm.respinta_da ?? []);
	const tutti = [...new Set([...req, ...si, ...no])];
	return `<div class="persone">${tutti.map((n) => {
		const c = no.has(n) ? 'no' : si.has(n) ? 'si' : '';
		const segno = no.has(n) ? '✗ ' : si.has(n) ? '✓ ' : '';
		return `<span class="persona ${c}">${segno}${esc(n)}</span>`;
	}).join('')}</div>`;
}

function schedaNota(n) {
	return `<a class="scheda" href="#/nota/${encodeURIComponent(n.path)}">
		<strong>${esc(nomeNota(n.path))}</strong>
		<span class="meta">${esc(progettoDi(n.path))} · <span class="stato ${classeStato(n.fm.approvazione)}">${esc(n.fm.approvazione)}</span></span>
		${n.fm.approvazione === 'in revisione' ? persone(n.fm, n.tipo) : ''}
	</a>`;
}

// --- viste ---
async function vistaLista() {
	vista.innerHTML = `<div class="riga-titolo"><h1>Design</h1><button class="piccolo" id="ricarica">↻ Aggiorna</button></div><p class="vuoto">Leggo il vault…</p>`;
	document.getElementById('ricarica').onclick = () => { indice = null; vistaLista(); };
	const { note } = await caricaIndice();
	const gruppi = [
		['Da approvare', note.filter((n) => n.fm.approvazione === 'in revisione'), 'Niente in revisione.'],
		['Da rivedere', note.filter((n) => n.fm.approvazione === 'da rivedere'), 'Niente da rivedere.'],
		['Approvate di recente', note.filter((n) => n.fm.approvazione === 'approvata')
			.sort((a, b) => String(b.fm.data_approvazione ?? '').localeCompare(String(a.fm.data_approvazione ?? ''))).slice(0, 8), 'Nessuna.'],
		['Bozze', note.filter((n) => n.fm.approvazione === 'bozza'), 'Nessuna.'],
	];
	vista.querySelector('.vuoto').remove();
	vista.insertAdjacentHTML('beforeend', gruppi.map(([titolo, lista, vuoto]) =>
		titolo === 'Bozze'
			? `<details><summary><h2 style="display:inline">${titolo} (${lista.length})</h2></summary>${lista.map(schedaNota).join('') || `<p class="vuoto">${vuoto}</p>`}</details>`
			: `<h2>${titolo} (${lista.length})</h2>${lista.map(schedaNota).join('') || `<p class="vuoto">${vuoto}</p>`}`,
	).join(''));
}

async function vistaNota(percorso) {
	vista.innerHTML = `<p class="vuoto">Apro la nota…</p>`;
	const idx = await caricaIndice();
	const g = gh();
	const testo = await g.testo(percorso, idx.testa);
	const fm = leggiFrontmatter(testo);
	const progetto = progettoDi(percorso);
	const tipo = idx.note.find((n) => n.path === percorso)?.tipo ?? 'gioco';
	const md = wikilinkInMarkdown(corpo(testo), idx.percorsi);
	const html = globalThis.marked.parse(md, { gfm: true, breaks: false });
	const inRevisione = fm.approvazione === 'in revisione';
	vista.innerHTML = `
		<p class="meta"><a href="#/">← Design</a> · ${esc(progetto)}</p>
		<h1>${esc(nomeNota(percorso))}</h1>
		${fm.approvazione ? `<span class="stato ${classeStato(fm.approvazione)}">${esc(fm.approvazione)}</span>` : ''}
		${fm.approvazione ? persone(fm, tipo) : ''}
		<article class="nota">${html}</article>
		${inRevisione ? `
		<div class="voto">
			<textarea id="motivo" rows="2" placeholder="Motivo (obbligatorio per modifiche o rifiuto)"></textarea>
			<div class="bottoni">
				<button class="verde" data-voto="approvo">Approvo</button>
				<button class="arancio" data-voto="modifiche">Modifiche</button>
				<button class="rosso" data-voto="respingo">Respingo</button>
			</div>
			<p class="aiuto">Voti come <b>${esc(conf().nome)}</b>. Il commit va su <code>${esc(conf().branch)}</code> del vault.</p>
		</div>` : ''}
		<p class="meta"><a href="https://github.com/${esc(conf().proprietario)}/${esc(conf().vault)}/blob/${esc(conf().branch)}/${percorso.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">Apri su GitHub</a></p>`;
	for (const b of vista.querySelectorAll('[data-voto]')) b.onclick = () => vota(percorso, b.dataset.voto);
}

const PAROLE = { approvo: 'Approvi', modifiche: 'Chiedi modifiche a', respingo: 'Respingi' };

/** Modifiche al vault raccolte in memoria e scritte poi in un solo commit, a partire dalla testa di main. */
async function lavoro() {
	const g = gh();
	const testa = await g.testa();
	const letti = new Map();
	const nuovi = new Map();
	const lav = {
		g,
		testa,
		async leggi(p) {
			if (nuovi.has(p)) return nuovi.get(p);
			if (!letti.has(p)) letti.set(p, await g.testo(p, testa).catch((e) => (e.status === 404 ? null : Promise.reject(e))));
			return letti.get(p);
		},
		scrivi(p, t) { nuovi.set(p, t); },
		async committa(titolo, righe) {
			const file = [...nuovi].filter(([p, t]) => t !== letti.get(p)).map(([path, testo]) => ({ path, testo }));
			if (!file.length) throw new Error('Niente da scrivere nel vault.');
			const corpo = [...righe, `- ${file.map((f) => f.path).join(', ')}`, '- dal telefono (Blue Mind mobile)'].join('\n');
			return g.commit({ testaAttesa: testa, titolo, corpo, file });
		},
	};
	return lav;
}

/** Voto su una nota di design: nota, Registro del progetto e, se esce dalla revisione, Stato. */
async function votoNota(lav, percorso, voto, motivo) {
	const c = conf();
	const progetto = progettoDi(percorso);
	const pReg = `Progetti/${progetto}/Registro.md`;
	const pStato = `Progetti/${progetto}/Stato.md`;
	const testo = await lav.leggi(percorso);
	const tipo = leggiFrontmatter((await lav.leggi(notaPrincipale(progetto))) ?? '').tipo ?? 'gioco';
	const r = applicaVoto({ testo, voto, nome: c.nome, motivo, oggi: oggi(), tipoProgetto: tipo });
	lav.scrivi(percorso, r.testo);
	const nome = nomeNota(percorso);
	const verbo = { approvo: 'approva', modifiche: 'chiede modifiche', respingo: 'respinge' }[voto];
	let cosa = `${nome}: ${c.nome} ${verbo}; esito ${r.esito}`;
	if (r.esito === 'in revisione' && r.mancano.length) cosa += ` (mancano ${r.mancano.join(', ')})`;
	if (voto !== 'approvo') cosa += ` — ${motivo.trim()}`;
	const registro = await lav.leggi(pReg);
	if (registro != null) lav.scrivi(pReg, rigaRegistro(registro, { data: oggi(), cosa, chi: c.nome, link: linkTabella(percorso, nome) }));
	let daSistemare = false;
	const stato = await lav.leggi(pStato);
	if (stato != null && r.esito !== 'in revisione') {
		const s = aggiornaStato(stato, percorso);
		daSistemare = s.daSistemare;
		lav.scrivi(pStato, s.testo);
	}
	return { esito: r.esito, cosa: cella(cosa), daSistemare };
}

// --- revisione di un push (dal bottone "Rivedi" del messaggio Telegram) ---
async function vistaRivedi(repo, testaPush, base, branch) {
	vista.innerHTML = `<p class="vuoto">Leggo il push…</p>`;
	const c = conf();
	const g = gh();
	const dati = await g.push1(repo, testaPush, base);
	const vault = repo === c.vault;
	const idx = vault ? await caricaIndice() : null;
	const inRevisione = vault
		? dati.file.filter((f) => f.stato !== 'removed' && idx.note.some((n) => n.path === f.path && n.fm.approvazione === 'in revisione')).map((f) => f.path)
		: [];
	vista.innerHTML = `
		<p class="meta"><a href="#/push">← Push</a></p>
		<h1>${esc(repo)} · ${esc(branch)}</h1>
		<p class="meta">${dati.commit.length} commit · <a href="${esc(dati.url)}" target="_blank" rel="noopener">differenze su GitHub</a></p>
		${dati.commit.map((x) => `<a class="scheda" href="${esc(x.url)}" target="_blank" rel="noopener"><strong>${esc(x.titolo)}</strong><span class="meta">${esc(x.sha.slice(0, 7))} · ${esc(x.autore)}</span></a>`).join('')}
		<details><summary class="meta">${dati.file.length} file cambiati</summary><ul class="meta">${dati.file.slice(0, 200).map((f) => `<li>${esc(f.stato)} · ${esc(f.path)}</li>`).join('')}</ul></details>
		${inRevisione.length ? `<h2>Design in revisione toccato (${inRevisione.length})</h2><p class="aiuto">Con il voto sul push voti anche queste note, a nome di ${esc(c.nome)}.</p>${inRevisione.map((p) => `<a class="scheda" href="#/nota/${encodeURIComponent(p)}"><strong>${esc(nomeNota(p))}</strong><span class="meta">${esc(progettoDi(p))}</span></a>`).join('')}` : ''}
		${vault && branch !== c.branch ? `<p class="aiuto">Push su <b>${esc(branch)}</b>: lo stato del design si legge da <b>${esc(c.branch)}</b>; le note cambiate solo su questo branch non si votano finché non arrivano lì.</p>` : ''}
		<div class="voto">
			<textarea id="motivo" rows="2" placeholder="Motivo (obbligatorio per Da rivedere)"></textarea>
			<div class="bottoni" style="grid-template-columns:1fr 1fr">
				<button class="verde" data-push="approvo">Approvo</button>
				<button class="arancio" data-push="modifiche">Da rivedere</button>
			</div>
			<p class="aiuto">Scrive nel Registro del progetto (o in Revisione commit) con un commit su <code>${esc(c.branch)}</code> del vault.</p>
		</div>`;
	for (const b of vista.querySelectorAll('[data-push]')) {
		b.onclick = () => revisionaPush({ repo, branch, dati, inRevisione, voto: b.dataset.push });
	}
}

async function revisionaPush({ repo, branch, dati, inRevisione, voto }, tentativo = 1) {
	const motivo = document.getElementById('motivo')?.value ?? '';
	if (voto !== 'approvo' && !motivo.trim()) { avviso('Scrivi il motivo.', true); return; }
	if (tentativo === 1 && !confirm(`${voto === 'approvo' ? 'Approvi' : 'Segni da rivedere'} il push su ${repo} (${dati.commit.length} commit)?`)) return;
	const bottoni = vista.querySelectorAll('[data-push]');
	bottoni.forEach((b) => { b.disabled = true; });
	try {
		const c = conf();
		const lav = await lavoro();
		// Dove scrivere: il Registro del progetto della repo; per il vault, quelli dei progetti toccati.
		const giochi = (await lav.leggi('Studio/Giochi.md')) ?? '';
		const progetti = repo === c.vault ? progettiToccati(dati.file.map((f) => f.path)) : [progettoDellaRepo(giochi, c.proprietario, repo)].filter(Boolean);
		const registri = [];
		for (const p of progetti) {
			const pr = `Progetti/${p}/Registro.md`;
			if ((await lav.leggi(pr)) != null) registri.push(pr);
		}
		if (!registri.length) {
			if ((await lav.leggi(NOTA_REVISIONI)) == null) lav.scrivi(NOTA_REVISIONI, notaRevisioniVuota(oggi()));
			registri.push(NOTA_REVISIONI);
		}
		const cosa = descriviPush({ repo, branch, commit: dati.commit, esito: voto, motivo });
		const link = `[${dati.commit.length > 1 ? 'differenze' : dati.commit[0].sha.slice(0, 7)}](${dati.url})`;
		for (const pr of registri) lav.scrivi(pr, rigaRegistro(await lav.leggi(pr), { data: oggi(), tipo: 'revisione', cosa, chi: c.nome, link }));
		// Il voto sul push vale anche per le note di design in revisione che il push ha toccato.
		const righe = [`- ${cosa}`];
		const saltate = [];
		for (const p of inRevisione) {
			try {
				const r = await votoNota(lav, p, voto === 'approvo' ? 'approvo' : 'modifiche', motivo);
				righe.push(`- ${r.cosa}`);
			} catch (e) { saltate.push(`${nomeNota(p)}: ${e.message}`); }
		}
		await lav.committa(`Revisione: push su ${repo} (${c.nome})`, righe);
		indice = null;
		avviso(`Fatto: push ${voto === 'approvo' ? 'approvato' : 'da rivedere'}${inRevisione.length - saltate.length ? `, ${inRevisione.length - saltate.length} note votate` : ''}.${saltate.length ? ` Saltate: ${saltate.join('; ')}` : ''}`);
		location.hash = '#/push';
	} catch (e) {
		if (tentativo < 2 && /expectedHeadOid|expected branch|head oid/i.test(e.message)) return revisionaPush({ repo, branch, dati, inRevisione, voto }, 2);
		avviso(e.message, true);
		bottoni.forEach((b) => { b.disabled = false; });
	}
}

async function vota(percorso, voto, tentativo = 1) {
	const motivo = document.getElementById('motivo')?.value ?? '';
	if (voto !== 'approvo' && !motivo.trim()) { avviso('Scrivi il motivo.', true); return; }
	if (tentativo === 1 && !confirm(`${PAROLE[voto]} "${nomeNota(percorso)}"?`)) return;
	const bottoni = vista.querySelectorAll('[data-voto]');
	bottoni.forEach((b) => { b.disabled = true; });
	try {
		const c = conf();
		const lav = await lavoro();
		const r = await votoNota(lav, percorso, voto, motivo);
		await lav.committa(`Approvazione: ${nomeNota(percorso)} (${c.nome})`, [`- ${r.cosa}`]);
		indice = null;
		avviso(`Fatto: ${r.esito}.${r.daSistemare ? ' In Stato.md la nota è citata insieme ad altre: sistemala dal PC.' : ''}`);
		await vistaNota(percorso);
	} catch (e) {
		if (tentativo < 2 && /expectedHeadOid|expected branch|head oid/i.test(e.message)) return vota(percorso, voto, 2);
		avviso(e.message, true);
		bottoni.forEach((b) => { b.disabled = false; });
	}
}

async function vistaPush() {
	vista.innerHTML = `<div class="riga-titolo"><h1>Push recenti</h1><button class="piccolo" id="ricarica">↻ Aggiorna</button></div><p class="vuoto">Leggo le repo…</p>`;
	document.getElementById('ricarica').onclick = vistaPush;
	const c = conf();
	const g = gh();
	const giochi = await g.testo('Studio/Giochi.md').catch(() => '');
	const repo = repoRegistrate(giochi, c.proprietario, c.vault);
	const risultati = await Promise.allSettled(repo.map((r) => g.push(r)));
	const errori = risultati.map((x, i) => (x.status === 'rejected' ? `${repo[i]}: ${x.reason.message}` : null)).filter(Boolean);
	const push = risultati.flatMap((x) => (x.status === 'fulfilled' ? x.value : []))
		.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30);
	// Gli eventi recenti di GitHub possono non avere l'elenco dei commit: leggo almeno l'ultimo.
	await Promise.all(push.slice(0, 15).filter((p) => !p.commit.length && p.testa).map(async (p) => {
		p.commit = [await g.messaggioCommit(p.repo, p.testa).catch(() => '')].filter(Boolean);
	}));
	vista.querySelector('.vuoto').remove();
	vista.insertAdjacentHTML('beforeend', `
		<p class="meta">Repo seguite: ${repo.map(esc).join(', ')}</p>
		${push.map((p) => `<a class="scheda push" href="#/rivedi/${encodeURIComponent(p.repo)}/${esc(p.testa)}?da=${esc(p.prima ?? '')}&branch=${encodeURIComponent(p.branch)}">
			<strong>${esc(p.repo)} · ${esc(p.branch)}</strong>
			<span class="meta">${esc(p.chi)} · ${esc(quando(p.quando))}${p.quanti ? ` · ${p.quanti} commit` : ''}</span>
			<ul class="commit">${p.commit.slice(0, 5).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
		</a>`).join('') || '<p class="vuoto">Nessun push recente.</p>'}
		${errori.length ? `<p class="aiuto">Non lette: ${errori.map(esc).join('<br>')}</p>` : ''}`);
}

function vistaImpostazioni() {
	const c = conf();
	vista.innerHTML = `
		<h1>Impostazioni</h1>
		<form id="form">
			<label for="token">Token GitHub</label>
			<input id="token" type="password" autocomplete="off" value="${esc(c.token)}" placeholder="github_pat_…">
			<p class="aiuto">Token fine-grained di ${esc(c.proprietario)}: repo del vault con <b>Contents: read and write</b>, le altre repo seguite con <b>Contents: read</b>. Resta solo su questo telefono.</p>
			<label for="nome">Voti come</label>
			<input id="nome" value="${esc(c.nome)}">
			<label for="proprietario">Account GitHub</label>
			<input id="proprietario" value="${esc(c.proprietario)}">
			<label for="vault">Repo del vault</label>
			<input id="vault" value="${esc(c.vault)}">
			<label for="branch">Branch delle approvazioni</label>
			<input id="branch" value="${esc(c.branch)}">
			<p class="aiuto">Le notifiche dei push arrivano su Telegram dal bot di Blue Mind; il bottone del messaggio apre questa app.</p>
			<p style="display:flex;gap:8px;margin-top:18px"><button class="primario" type="submit">Salva</button><button type="button" id="prova">Prova il token</button></p>
		</form>`;
	const valori = () => Object.fromEntries(['token', 'nome', 'proprietario', 'vault', 'branch'].map((k) => [k, document.getElementById(k).value.trim()]));
	document.getElementById('form').onsubmit = (e) => {
		e.preventDefault();
		salva(CHIAVE_CONF, valori());
		indice = null;
		avviso('Salvato.');
		location.hash = '#/';
	};
	document.getElementById('prova').onclick = async () => {
		const v = valori();
		try {
			const g = new GitHub(v);
			const r = await g.rest(`/repos/${v.proprietario}/${v.vault}`);
			avviso(r.permissions?.push ? 'Token valido, può scrivere nel vault.' : 'Token valido ma senza scrittura sul vault.', !r.permissions?.push);
		} catch (e) { avviso(e.message, true); }
	};
}

// --- navigazione ---
async function vai() {
	const h = location.hash || '#/';
	const nome = h.startsWith('#/push') || h.startsWith('#/rivedi') ? 'push' : h.startsWith('#/impostazioni') ? 'impostazioni' : 'lista';
	for (const a of document.querySelectorAll('nav a')) a.classList.toggle('attiva', a.dataset.vista === nome);
	if (!conf().token && nome !== 'impostazioni') { location.hash = '#/impostazioni'; return; }
	try {
		if (h.startsWith('#/nota/')) await vistaNota(decodeURIComponent(h.slice(7)));
		else if (h.startsWith('#/rivedi/')) {
			// #/rivedi/<repo>/<sha di testa>?da=<sha di base>&branch=<branch>
			const [percorso, query = ''] = h.slice(9).split('?');
			const [repo, testa] = percorso.split('/').map(decodeURIComponent);
			const q = new URLSearchParams(query);
			await vistaRivedi(repo, testa, q.get('da'), q.get('branch') ?? '');
		}
		else if (nome === 'push') await vistaPush();
		else if (nome === 'impostazioni') vistaImpostazioni();
		else await vistaLista();
		window.scrollTo(0, 0);
	} catch (e) {
		vista.innerHTML = `<p class="vuoto">Non riesco a leggere GitHub.</p><p class="aiuto">${esc(e.message)}</p><p><a href="#/impostazioni">Controlla le impostazioni</a></p>`;
	}
}
addEventListener('hashchange', vai);
document.addEventListener('visibilitychange', () => { if (!document.hidden && (location.hash || '#/') === '#/') { indice = null; vai(); } });
vai();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
