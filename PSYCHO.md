# Document de Game Design : Mécaniques de Rétention et d'Engagement (Addiction Features)

## 1. Rétention Quotidienne & Urgence (FOMO)
*   **Système de Séries de Connexion (Streaks) :**
    *   **Biais cognitif :** Aversion à la perte (Loss Aversion).
    *   **Objectif :** Créer une habitude quotidienne en menaçant de détruire un investissement passé.
    *   **Concept :** Calendrier de récompenses croissantes. Une journée manquée réinitialise la progression, avec une option de "sauvetage" (monnaie/pub) pour conserver la série et ne pas perdre l'œuf légendaire du jour 7.
*   **Défis Flash (Minuteurs d'Événements) :**
    *   **Biais cognitif :** Peur de rater quelque chose (FOMO) et Urgence temporelle.
    *   **Objectif :** Déclencher des sessions de jeu immédiates et intenses.
    *   **Concept :** Des objectifs (ex: "Terminer 3 mondes en 3 min") liés à un compte à rebours très visible. La récompense disparaît définitivement à la fin du temps imparti.

## 2. Économie, Monétisation & Récompenses Aléatoires
*   **La "Seconde Chance" (Continue) :**
    *   **Biais cognitif :** Biais des coûts irrécupérables (Sunk Cost Fallacy).
    *   **Objectif :** Générer des revenus publicitaires ou forcer la dépense de monnaie premium en exploitant la frustration de l'échec.
    *   **Concept :** Lors d'un impact fatal avec un gros score, l'écran se fige. Un compte à rebours stressant (5 secondes) propose de reprendre exactement là où le joueur est mort en échange d'une pub ou de gemmes.
*   **Boutique Rotative Éphémère :**
    *   **Biais cognitif :** Rareté perçue.
    *   **Objectif :** Pousser au *grinding* (collecte répétitive) pour que le joueur maintienne toujours un solde de monnaie élevé.
    *   **Concept :** Les cosmétiques ne sont disponibles que sur des fenêtres de 2 à 24 heures maximum, forçant un achat impulsif.
*   **Lootboxes avec "Pity System" :**
    *   **Biais cognitif :** Renforcement à ratio variable.
    *   **Objectif :** Rendre l'ouverture addictive tout en évitant le taux de désinstallation (churn) lié à une malchance extrême.
    *   **Concept :** La probabilité de trouver un objet rare dans un œuf augmente invisiblement à chaque tentative ratée jusqu'à être garantie à 100% au bout d'un certain nombre d'ouvertures.

## 3. Manipulation Cognitive du Gameplay (Illusion de Contrôle)
*   **Hitboxes Asymétriques & Effet "Quasi-Gagné" :**
    *   **Biais cognitif :** Effet de Quasi-Gagné (Near-Miss Effect).
    *   **Objectif :** Générer le besoin irrépressible de réessayer instantanément sans créer de ressentiment envers l'équité du jeu.
    *   **Concept :** La zone de collision (hitbox) du dinosaure est plus petite que son visuel 3D, et celle des pièces est plus grande. En cas d'impact, un bref ralenti (slow-motion) montre que le joueur a raté à un millimètre près.
*   **Adaptation Dynamique de la Frustration (Rubberbanding) :**
    *   **Biais cognitif :** Maintien du "Flow" (équilibre entre ennui et anxiété).
    *   **Objectif :** Lisser la courbe de difficulté de manière invisible pour retenir le joueur.
    *   **Concept :** Si l'algorithme détecte 3 échecs rapides, la piste génère des obstacles espacés. Si la partie dure trop longtemps (risque d'ennui), un motif presque impossible est généré pour tuer le joueur au pic de sa session.
*   **La Piste de la Tentation (Risk/Reward) :**
    *   **Biais cognitif :** Attribution interne.
    *   **Objectif :** Faire assumer l'échec au joueur pour qu'il relance la partie par orgueil.
    *   **Concept :** Division temporaire de la piste : une voie large et sûre (peu rémunératrice) et une voie très étroite, sans rebords, remplie d'œufs dorés.
*   **Preuve Sociale Dynamique (Effet du Lièvre) :**
    *   **Biais cognitif :** Preuve sociale et Compétition.
    *   **Objectif :** Créer des micro-objectifs atteignables en cours de partie.
    *   **Concept :** Placer des panneaux physiques avec l'avatar et le score d'amis (ou de bots) directement sur la piste. Le dinosaure les pulvérise en les dépassant.

## 4. Engagement Tactile & Surcharge Sensorielle
*   **Portes Multiplicatrices à Choix Rapide :**
    *   **Biais cognitif :** Surcharge cognitive et Aversion au regret.
    *   **Objectif :** Provoquer une erreur d'inattention qui engendre une relance immédiate.
    *   **Concept :** Des portes de calcul (+50 vs x3) ou des pièges de couleurs forçant un choix de trajectoire en une fraction de seconde.
*   **Mécanique de Fusion (Merge) en temps réel :**
    *   **Biais cognitif :** Besoin de complétion (Effet Zeigarnik).
    *   **Objectif :** Ajouter une boucle de satisfaction organisationnelle.
    *   **Concept :** Accumuler des clones provoque des fusions automatiques (3 petits raptors = 1 tricératops), rangeant visuellement le chaos à l'écran.
*   **Micro-feedback (Hitstop & Pitch Sonore) :**
    *   **Biais cognitif :** Synesthésie tactile / ASMR.
    *   **Objectif :** Rendre l'interaction physique avec l'écran intrinsèquement gratifiante.
    *   **Concept :** Le son de la collecte de pièces monte dans les aigus continuellement. Lors de la destruction d'un obstacle, l'écran se fige 0,1 seconde (Hitstop) et le modèle 3D du dinosaure s'étire (Squash & Stretch) pour accentuer l'impact de l'action.

## 5. Contraste Émotionnel & Récence
*   **Mode Frénésie (Fever Mode) :**
    *   **Biais cognitif :** Rupture d'habituation.
    *   **Objectif :** Renverser le rapport de force émotionnel.
    *   **Concept :** Une fois une jauge remplie, le joueur devient invincible. Les obstacles mortels deviennent des cibles destructibles extrêmement rémunératrices en points, avec une saturation des couleurs et un rythme musical accéléré.
*   **Multiplicateur de Fin de Ligne (Finish Line) :**
    *   **Biais cognitif :** Effet de récence.
    *   **Objectif :** S'assurer que la dernière émotion de la session soit un pic d'adrénaline, garantissant un souvenir positif du jeu.
    *   **Concept :** Remplacer l'écran statique de "Niveau Terminé" par un mini-jeu de "tap" frénétique chronométré (3 sec) pour multiplier le score final en repoussant un météore ou un boss géant.

    ## 6. Profondeur de Gameplay (Easy to learn, hard to master)
*   **La Parade Offensive (Tap-to-Smash / Perfect Timing) :**
    *   **Biais cognitif :** Haut risque / Haute récompense (Conditionnement opérant).
    *   **Objectif :** Valoriser la maîtrise absolue du jeu et transformer le joueur passif (qui subit la course) en prédateur agressif. Cela fidélise les joueurs vétérans en leur offrant un axe de progression infini.
    *   **Concept :** Outre le balayage pour esquiver, un simple tapotement (tap) permet de détruire un obstacle mortel spécifique, mais exige un timing parfait au millième de seconde. Un succès fige l'écran (Hitstop de 0,2s) avec un son lourd et lâche des récompenses premium. Une erreur de timing lance une animation dans le vide (cooldown) qui condamne le joueur à s'écraser, rendant la prise de risque extrêmement grisante.