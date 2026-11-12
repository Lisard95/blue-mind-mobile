# Blue Mind mobile

App web (PWA) di Light Blue Labs per il telefono:

- **Design**: le note del vault `in revisione`, `da rivedere`, approvate di recente e bozze. Apri una nota, la leggi e voti **Approvo / Modifiche / Respingo**. Il voto è un commit sul vault (nota, `Registro.md`, `Stato.md`) che segue la procedura di approvazione dello studio.
- **Push**: gli ultimi push sul vault e sulle repo registrate in `Studio/Giochi.md`.

Le notifiche dei push arrivano su Telegram: i webhook di GitHub chiamano il bot di Blue Mind, e il bottone del messaggio apre questa app.

## Installazione sul telefono
1. Apri `https://lisard95.github.io/blue-mind-mobile/` e aggiungila alla schermata Home (Android: menu ⋮ → Installa app; iPhone: Condividi → Aggiungi a Home).
2. Crea un token fine-grained su GitHub (Settings → Developer settings → Fine-grained tokens): repo `light-blue-labs` con **Contents: read and write**, le repo seguite con **Contents: read**. Incollalo in ⚙.
3. Notifiche: `python Strumenti/blue-mind/notifiche.py` nel vault (bot Telegram, istruzioni nello script).

## Sviluppo
Niente build. `npm test` prova la logica dell'approvazione. Per provarla sul PC: `npx serve .` (o qualunque server statico) e apri l'indirizzo.
