import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	leggiFrontmatter, impostaChiave, applicaVoto, rigaRegistro, aggiornaStato,
	candidata, repoRegistrate, wikilinkInMarkdown, linkTabella,
	progettoDellaRepo, progettiToccati, descriviPush, cella,
} from '../lib/approva.js';

const nota = `---
tags: [feature]
progetto: Tower Defense
approvazione: in revisione
approvata_da:
  - Magda Janik
data_approvazione:
---
# Carri

## Revisione
<!-- commento del template -->

## Altro
testo
`;

test('legge liste a blocco, in riga e valori vuoti', () => {
	const fm = leggiFrontmatter(nota);
	assert.deepEqual(fm.tags, ['feature']);
	assert.deepEqual(fm.approvata_da, ['Magda Janik']);
	assert.equal(fm.data_approvazione, null);
	assert.equal(fm.approvazione, 'in revisione');
});

test('impostaChiave sostituisce la lista a blocco e aggiunge chiavi nuove', () => {
	let t = impostaChiave(nota, 'approvata_da', ['A', 'B']);
	assert.match(t, /approvata_da: \[A, B\]\ndata_approvazione:/);
	t = impostaChiave(t, 'respinta_da', []);
	assert.match(t, /respinta_da: \[\]\n---/);
});

test('approvo: manca ancora qualcuno, resta in revisione', () => {
	const r = applicaVoto({ testo: nota, voto: 'approvo', nome: 'Andrea Bianchini', oggi: '2026-11-12', tipoProgetto: 'gioco' });
	assert.equal(r.esito, 'in revisione');
	assert.deepEqual(r.mancano, ['Stefano Gosta']);
	assert.deepEqual(leggiFrontmatter(r.testo).approvata_da, ['Magda Janik', 'Andrea Bianchini']);
	assert.match(r.testo, /<!-- commento del template -->\n- 2026-11-12, Andrea Bianchini: approvo\n\n## Altro/);
});

test('approvo: tutti presenti, approvata con data', () => {
	const t = impostaChiave(nota, 'approvata_da', ['Magda Janik', 'Stefano Gosta']);
	const r = applicaVoto({ testo: t, voto: 'approvo', nome: 'Andrea Bianchini', oggi: '2026-11-12', tipoProgetto: 'gioco' });
	assert.equal(r.esito, 'approvata');
	const fm = leggiFrontmatter(r.testo);
	assert.equal(fm.approvazione, 'approvata');
	assert.equal(fm.data_approvazione, '2026-11-12');
});

test('software: basta Andrea; approvatori espliciti nella nota vincono', () => {
	const r = applicaVoto({ testo: nota, voto: 'approvo', nome: 'Andrea Bianchini', oggi: 'x', tipoProgetto: 'software' });
	assert.equal(r.esito, 'approvata');
	const t = impostaChiave(nota, 'approvatori', ['Andrea Bianchini', 'Diego Argentari']);
	const r2 = applicaVoto({ testo: t, voto: 'approvo', nome: 'Andrea Bianchini', oggi: 'x', tipoProgetto: 'software' });
	assert.deepEqual(r2.mancano, ['Diego Argentari']);
});

test('modifiche e respingo: motivo obbligatorio, esiti giusti', () => {
	assert.throws(() => applicaVoto({ testo: nota, voto: 'modifiche', nome: 'Andrea Bianchini', oggi: 'x' }), /motivo/);
	const m = applicaVoto({ testo: nota, voto: 'modifiche', nome: 'Andrea Bianchini', motivo: 'troppo grande', oggi: '2026-11-12' });
	assert.equal(m.esito, 'da rivedere');
	assert.deepEqual(leggiFrontmatter(m.testo).respinta_da, ['Andrea Bianchini']);
	assert.match(m.testo, /chiedo modifiche — troppo grande/);
	const r = applicaVoto({ testo: nota, voto: 'respingo', nome: 'Andrea Bianchini', motivo: 'fuori pilastri', oggi: 'x' });
	assert.equal(r.esito, 'respinta');
	const r2 = applicaVoto({ testo: nota, voto: 'respingo', nome: 'Magda Janik', motivo: 'scope', oggi: 'x' });
	assert.equal(r2.esito, 'da rivedere');
});

test('si vota solo in revisione', () => {
	const t = impostaChiave(nota, 'approvazione', 'bozza');
	assert.throws(() => applicaVoto({ testo: t, voto: 'approvo', nome: 'A', oggi: 'x' }), /in revisione/);
});

test('sezione Revisione creata se manca; CRLF conservato', () => {
	const t = '---\r\napprovazione: in revisione\r\n---\r\n# X\r\n';
	const r = applicaVoto({ testo: t, voto: 'approvo', nome: 'Andrea Bianchini', oggi: 'd', tipoProgetto: 'software' });
	assert.ok(r.testo.includes('\r\n## Revisione\r\n- d, Andrea Bianchini: approvo'));
	assert.ok(!/[^\r]\n/.test(r.testo));
});

test('rigaRegistro va in cima alla tabella', () => {
	const reg = '# R\n<!-- c -->\n\n| Data | Tipo | Cosa | Chi | Link |\n|---|---|---|---|---|\n| 2026-11-01 | evento | vecchio | A | x |\n';
	const out = rigaRegistro(reg, { data: '2026-11-12', cosa: 'approvata', chi: 'Andrea Bianchini', link: linkTabella('Progetti/T/Design/X.md', 'X') });
	const righe = out.split('\n');
	assert.equal(righe[5], '| 2026-11-12 | approvazione | approvata | Andrea Bianchini | [[Progetti/T/Design/X\\|X]] |');
	assert.match(righe[6], /vecchio/);
});

test('aggiornaStato toglie solo i punti che parlano solo della nota', () => {
	const st = `## In attesa di approvazione
- [[Progetti/T/Design/X|X]] in revisione.
- Due note: [[Progetti/T/Design/X|X]] e [[Progetti/T/Design/Y|Y]].

## Rischi
- [[Progetti/T/Design/X|X]]
`;
	const r = aggiornaStato(st, 'Progetti/T/Design/X.md');
	assert.equal(r.daSistemare, true);
	assert.ok(!r.testo.includes('in revisione.'));
	assert.ok(r.testo.includes('Due note'));
	assert.ok(r.testo.includes('## Rischi\n- [[Progetti/T/Design/X|X]]'));
});

test('candidata esclude fonti, log e note di servizio', () => {
	assert.ok(candidata('Progetti/T/Design/Carri.md'));
	assert.ok(candidata('Progetti/T/Contenuti/Torre.md'));
	assert.ok(!candidata('Progetti/T/Fonti/F.md'));
	assert.ok(!candidata('Progetti/T/Registro.md'));
	assert.ok(!candidata('Studio/Organigramma.md'));
});

test('repoRegistrate legge Giochi.md', () => {
	const g = '| X | [a](https://github.com/Lisard95/from-white-to-blue) | `github.com/Lisard95/little-inkwell` (privato) | github.com/Lisard95/<nome> |';
	assert.deepEqual(repoRegistrate(g, 'Lisard95', 'light-blue-labs'), ['light-blue-labs', 'from-white-to-blue', 'little-inkwell']);
});

test('wikilink diventano link interni o testo', () => {
	const p = new Set(['Progetti/T/Design/Pitch.md', 'Studio/Organigramma.md']);
	const out = wikilinkInMarkdown('Vedi [[Progetti/T/Design/Pitch|Pitch]], [[Organigramma]], [[Manca]] e ![[img.png]]', p);
	assert.equal(out, 'Vedi [Pitch](#/nota/Progetti%2FT%2FDesign%2FPitch.md), [Organigramma](#/nota/Studio%2FOrganigramma.md), **Manca** e *(allegato: img.png)*');
});

test('progettoDellaRepo legge la riga giusta di Giochi.md', () => {
	const g = [
		'| The Castle | [[Progetti/The Castle and the Fairy/The Castle and the Fairy\|P]] | [from-white-to-blue](https://github.com/Lisard95/from-white-to-blue) | x |',
		'| Mobile | [[Strumenti/blue-mind/LEGGIMI\|Blue Mind]] | [blue-mind-mobile](https://github.com/Lisard95/blue-mind-mobile) | x |',
		'| Libri | [[Progetti/Libri da colorare/Libri da colorare\|L]] | `github.com/Lisard95/little-inkwell` | x |',
	].join('\n');
	assert.equal(progettoDellaRepo(g, 'Lisard95', 'from-white-to-blue'), 'The Castle and the Fairy');
	assert.equal(progettoDellaRepo(g, 'Lisard95', 'little-inkwell'), 'Libri da colorare');
	assert.equal(progettoDellaRepo(g, 'Lisard95', 'blue-mind-mobile'), null);
	assert.equal(progettoDellaRepo(g, 'Lisard95', 'from-white'), null);
});

test('progettiToccati e descriviPush', () => {
	assert.deepEqual(progettiToccati(['Progetti/A/x.md', 'Studio/y.md', 'Progetti/A/z.md', 'Progetti/B/k.md']), ['A', 'B']);
	const d = descriviPush({ repo: 'r', branch: 'main', esito: 'approvo', commit: [{ sha: 'abcdef123', titolo: 'Uno | due' }] });
	assert.equal(d, 'Push su r (main), 1 commit approvato: abcdef1 Uno / due');
	assert.equal(cella('a\\|b | c\nd'), 'a\\|b / c d');
});
