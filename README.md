# Dino Escape

Runner 3D arcade : le dino de la page « Pas de connexion » vole une voiture et fuit
le navigateur, poursuivi par un curseur géant qui veut fermer l'onglet.

## Lancer
    npm install
    npm run dev        # http://localhost:5173 (accessible sur le réseau local pour tester sur mobile)

## Contrôles
- ← / → (ou A/Q, D) : tourner
- ESPACE (maintenu en tournant) : drift ; relâcher = mini-turbo (bleu, puis orange si chargé)
- ↓ : freiner
- Mobile : moitié gauche/droite de l'écran, deux doigts = drift

## Publier sur itch.io
    npm run zip        # crée dino-escape-itch.zip
Sur itch.io : Kind of project = HTML, uploader le zip, cocher « This file will be played in the browser »,
viewport 1280×720, activer « Fullscreen button » et « Mobile friendly ».

## Où régler quoi
- `src/car.js` → `TUNING` : vitesse, grip, drift, turbo (le game feel)
- `src/themes.js` : zones (couleurs, obstacles, décor), longueur d'une zone
- `src/track.js` : génération de la route, obstacles (`OBSTACLES`), décor (`DECOR`)
- `src/main.js` : boucle, curseur poursuivant (`GAP_START`, `GAP_MAX`, vitesse), caméra, HUD
- `src/audio.js` : sons synthétisés (aucun fichier)
