# Dino Race Fight Club

Runner 3D : le dino de la page « Pas de connexion » s'enfuit du navigateur en courant, poursuivi
en affrontant ses rivaux (PNJ en solo, amis en multijoueur). Route procédurale (virages serrés, dénivelé), armes,
boss, boutique (skins, musiques, améliorations) et musique générée en direct par Google DeepMind Lyria.

## Aperçu sur ordinateur

Captures du rendu du jeu en **1440 × 900**. Les courses traversent cinq mondes avant de rejoindre les rings.

![Course dans le désert : tunnel lumineux et cookies obstacles](docs/screenshots/race-desert-desktop.png)

![Course dans le navigateur : fenêtres géantes, décor pastel et rivaux](docs/screenshots/race-browser-desktop.png)

![Course dans le hardware : circuits, processeurs et tunnel néon](docs/screenshots/race-hardware-desktop.png)

Dans le Fight Club, les vrais skins remplissent les gradins et le combo se termine par un salto et une explosion cartoon.

![Salto du dino reggae dans le Fight Club, devant les dinos spectateurs](docs/screenshots/fight-club-salto-desktop.png)

![Coup final : explosion, particules et effets de vitesse dans le ring](docs/screenshots/fight-club-impact-desktop.png)

## Dino reggae et rendu

- **Riddim**, le dino reggae low poly, est disponible dès le départ. Le bouton « Dino reggae »
  l'équipe aussi sur les anciennes sauvegardes, sans effacer la progression.
- Son thème Reggae est inclus tant qu'il est équipé ; les autres thèmes et achats restent disponibles.
- Cinq mondes : désert hors ligne, navigateur, Windows, hardware, cloud. Cactus et mesas,
  onglets et pop-ups, dossiers du bureau, circuits et ventilateurs, serveurs sur les nuages.
- Tous les 720 m, un saut guidé franchit un portail vers le monde suivant. Le contrôle revient
  à l'atterrissage ; les zones de départ et d'arrivée sont dégagées. Le cloud se poursuit à l'infini.
- Néons réactifs au rythme, décors fusionnés par matériau et libérés derrière le joueur.
- Rendu de maquette low poly : volumes biseautés, matières mates, sol raccordé à la route,
  massifs de végétation animée, arbres, bancs, pavés, lanternes et composants miniatures dans le hardware.
- Tunnels facettés de 92 m, arceaux et rails lumineux : ils suivent les courbes,
  avec une transition douce vers un éclairage intérieur. Ils restent hors des portails et des épingles.
- Variantes de couleurs et de décors par monde. Post-traitement : ombres de contact GTAO sur ordinateur, bloom HDR,
  contraste coloré, grain fin, vignette et décomposition chromatique pendant les sprints et portails, tone mapping ACES
  et anticrénelage MSAA. La résolution est plafonnée pour limiter le coût sur mobile.
- Le jury saisit sa propre clé Gemini dans le menu Musique. Aucun relais serveur n'est nécessaire.

## Costumes inclus

Dark Vador (casque, cape animée et sabre), Drift · Fortnite (masque kitsune et pioche),
Mario (casquette, moustache et salopette) et Alligator rejoignent la collection gratuitement,
y compris sur les anciennes sauvegardes. Choisir **Collection & boutique → Skins → Équiper**.
Les aperçus 3D montrent les vrais modèles. Les costumes sont cosmétiques et fonctionnent aussi pour les rivaux en multijoueur.

## Lancer
    npm install
    npm run dev        # http://localhost:5173 (accessible sur le réseau local pour tester sur mobile)

## Contrôles
- ← / → (ou A/Q, D) : se décaler
- ESPACE / ↑ : sauter
- SHIFT (en tournant) : glissade ; relâcher = sprint (bleu, puis orange si chargé)
- ↓ : freiner
- Mobile : moitié gauche/droite de l'écran, glisser vers le haut = saut, deux doigts = glissade

## Publier sur itch.io
    npm run zip        # crée dino-race-fight-club-itch.zip
Sur itch.io : Kind of project = HTML, uploader le zip, cocher « This file will be played in the browser »,
viewport 1280×720, activer « Fullscreen button » et « Mobile friendly ».

## Tests
    npm test           # tests du kernel et de dégagement/streaming des tunnels (sans navigateur)

## Architecture
Voir **[ARCHITECTURE.md](ARCHITECTURE.md)** : kernel / vues / contenu, liste des événements, et comment
ajouter un ennemi, un boss, une arme, un skin (y compris un .glb), une musique ou une amélioration.

## Où régler quoi
- `src/kernel/config.js` : physique du dino (`RUNNER`), règles (`GAME`), route (`TRACK`), rythme (`DIRECTOR`)
- `src/content/` : zones, ennemis, armes, boss, skins, musiques, boutique
- `src/view/models/` : apparence de chaque entité et du dino

## Musique Lyria
Menu 🎵 MUSIQUE → saisir une clé API Gemini (https://aistudio.google.com/apikey). Sans clé, un synthé
procédural prend le relais. En dev, on peut aussi mettre `VITE_GEMINI_API_KEY=...` dans `.env.local`
(jamais dans un build publié).

### Claques et feedback de combat

`E` / `F` ou le bouton ✋ donne une claque au rival le plus proche à portée. Un cadre doré repère la cible et la jauge indique les deux secondes de recharge. Une main low poly accompagne le geste ; le joueur touché recule brièvement, avec un éclat « SLAP! », des étoiles et un claquement WebAudio synthétisé (aucun service ni clé requis).

Les animations passent par un pivot visuel séparé des positions réseau : les claques ne font plus accumuler de rotation aux dinos. Les effets et le son d'un coup multijoueur sont confirmés par la victime via le canal cosmétique `fx`, puis affichés au point touché chez les autres joueurs. Le solo avec PNJ utilise les mêmes effets. Tous les joueurs doivent recharger la nouvelle version.

### Fight Club mobile

Un portique annonce le premier duel à **2 500 m**, puis tous les **2 500 m**. À 180 m du ring, une annonce animée affiche la distance restante avec des mains qui se rapprochent et un signal sonore. À 60 m, elle passe à « GET READY TO TAP! » ; le portique pulse en néon. La course se suspend pendant le combat et reprend au même endroit. En solo, le rival est un bot ; en multijoueur, l'hôte affronte le joueur vivant le plus proche et les autres joueurs en course regardent le duel.

Après le compte à rebours, tapoter le gros bouton pendant **3 secondes** (ou appuyer sur E / F / espace). Chaque tap validé donne une claque, avec main 3D, son, combo, éclats et réaction du rival. Le gagnant place un coup final et prend **la moitié des pièces de course du perdant, arrondie au-dessus, au maximum 20**. Les pièces déjà en banque ne sont pas engagées. Le perdant perd **une vie** à la fin de la cinématique, reste **immobile pendant 1 seconde** à la reprise, puis sa vitesse passe à **65 % pendant 5 secondes**. À zéro vie, la partie se termine après le coup final. Les bots ont également trois vies pour les duels. Tous les PNJ sont gelés pendant le duel, classement compris ; ils repartent ensemble à la sortie du ring, avec cette pénalité pour le seul perdant. Égalité : aucune pièce volée, aucun ralentissement.

L'arène utilise le même renderer et les mêmes passes de post-processing que la course. Les animations sont faites directement sur les modèles low poly ; aucun appel d'API ni téléchargement ne bloque un duel. L'entrée dans le ring vide les commandes tactiles/clavier pour éviter de repartir en sautant ou en tournant après les taps.

Le canal multijoueur `fc` gère l'entrée, la disponibilité des participants, des comptes cumulatifs et un résultat décidé par l'hôte. Les résultats répétés ne créditent pas le butin deux fois ; une déconnexion ou un score final manquant avant le résultat annule le duel sans pénalité. Tests automatiques avec latence, trois clients, rejeu de messages et déconnexion. Recharger la même version chez tous les joueurs.

Les cookies roulants apparaissent désormais dans les cinq mondes, plus souvent dans le navigateur et le cloud. Le navigateur reçoit aussi des bandeaux cookies. Ce sont des obstacles à esquiver, pas des objets à ramasser ; les exclusions des virages serrés et des transitions de monde restent appliquées à leur génération.

Le ring utilise les vrais skins pour ses 56 dinos spectateurs (géométries regroupées pour limiter les appels de rendu). Les combos alternent claques, uppercuts, coups de pied et saltos ; la finale comprend un salto offensif puis une roulade du perdant, qui se relève. Les rotations sont calculées depuis une pose de référence, sans accumulation. Particules instanciées, fumée, ondes, flashs et traînées accompagnent les impacts. Claquement, souffle de salto, explosion et acclamations sont synthétisés en WebAudio, sans clé ni service externe.
