# Project Manager Bot (Discord)

Bot Discord pour gérer des **projets** (création, archivage, désarchivage, suppression) avec salons privés et rôles dédiés.  
Stack : **Node 18+**, **discord.js v14**, hébergé sur **Railway**.

---

## 1) Fonctionnalités

- `/newproject <nom>` : crée un rôle projet, 1 bannière, 5 salons texte (`brief`, `discussion`, `ressources`, `livrables`, `retours`) et 1 salon vocal. Tout est **privé** (visible par Admin, Membres, Rôle Projet et le bot).
- `/archive <nom>` : déplace tous les salons texte du projet vers la catégorie d’archives, supprime le vocal et le rôle projet.
- `/unarchive <nom>` : remet les salons texte en catégorie active, recrée le vocal et un nouveau rôle projet (et met à jour les permissions).
- `/delete <nom>` : supprime tous les salons du projet (texte + vocal) et le rôle projet.

**Technique** : chaque salon texte du projet porte un `topic` contenant `PROJECT:<slug>`, ce qui permet de retrouver tous les salons liés à un projet (c’est plus fiable que chercher par nom).

---

## 2) Prérequis

- Un serveur Discord où vous avez les droits d’**Administrateur**.
- Node.js **>= 18** installé en local (pour enregistrer les slash commands).
- Un compte **GitHub** et **Railway** (hébergement gratuit avec quota).
- Les ID de votre serveur et rôles Admin/Membres.

---

## 3) Création de l’application & du bot sur Discord

1. Ouvrez le **Discord Developer Portal** : https://discord.com/developers/applications
2. **New Application** → Nom de l’app → Create.
3. Onglet **Bot** → **Add Bot** → Confirm.
4. (Optionnel mais recommandé) Activez **Privileged Gateway Intents** : `SERVER MEMBERS INTENT`.
5. Copiez le **Token** du bot (vous le mettrez dans `.env`).

### Inviter le bot sur votre serveur
1. Onglet **OAuth2 → URL Generator** :
   - **Scopes** : cochez `bot` et `applications.commands`.
   - **Bot Permissions** : cochez au minimum `Administrator` (ou à défaut `Manage Channels`, `Manage Roles`, `View Channels`, `Send Messages`, `Connect`, `Speak`).
2. Copiez l’URL générée et ouvrez-la dans votre navigateur, puis **invite**z le bot sur votre serveur.

---

## 4) Préparer le projet en local

```bash
git clone https://github.com/<votre_user>/<votre_repo>.git
cd project-manager-bot

# Dépendances
npm install

# (optionnel) mettez à jour discord.js si besoin
# npm i discord.js@^14
```

Créez le fichier `.env` à la racine (non versionné) en vous basant sur `.env.example` :

```env
TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLIENT_ID=123456789012345678        # ID de l'application (onglet General Information)
GUILD_ID=123456789012345678         # ID du serveur (clic droit → Copier l'identifiant)

ADMIN_ROLE_ID=123456789012345678    # rôle Admin sur le serveur
MEMBERS_ROLE_ID=123456789012345678  # rôle Membres sur le serveur

ACTIVE_CATEGORY_NAME=🎛️ PROJETS EN COURS 🎛️
ARCHIVE_CATEGORY_NAME=📦 PROJETS ARCHIVÉS 📦
```

> Astuce : si vous n’avez pas les IDs, activez le **mode développeur** dans Discord (Paramètres → Avancés → Mode développeur), puis clic droit sur l’élément → Copier l’identifiant.

---

## 5) Enregistrer les commandes slash (obligatoire)

Chaque fois que vous modifiez la définition des commandes, exécutez :
```bash
npm run register
```
Vous devez voir :
```
⏳ Enregistrement des commandes…
✅ Commandes enregistrées.
```

> Si vous hébergez ailleurs, **l’enregistrement des commandes se fait depuis votre machine**, pas par Railway.

---

## 6) Lancer en local (test rapide)

```bash
npm start
```
Dans la console :
```
✅ Connecté en tant que Project Manager#XXXX
```
Dans Discord, tapez `/newproject Test` dans un salon où le bot a accès. Vous devez voir apparaître les salons privés.

> Si ça ne marche pas, vérifiez les logs et les **permissions du bot** dans Paramètres du serveur → Intégrations → votre bot.

---

## 7) Déployer gratuitement sur Railway

### A. Créer le projet Railway
1. Allez sur https://railway.app → `New Project` → `Deploy from GitHub repo` → choisissez votre repo.
2. Dans l’onglet **Variables**, ajoutez toutes les clés de votre `.env` (sauf `ACTIVE_CATEGORY_NAME`/`ARCHIVE_CATEGORY_NAME` si vous les laissez par défaut).

### B. Build & Start automatiques
- Railway détecte votre `package.json` et lance `npm start`.
- Les logs doivent afficher : `✅ Connecté en tant que …`.

### C. Mettre à jour le code (workflow)
1. Modifiez vos fichiers en local.
2. Poussez sur GitHub :
   ```bash
   git add .
   git commit -m "fix/update: votre message"
   git push origin main
   ```
3. Railway reconstruit et redémarre automatiquement.

---

## 8) Commandes utiles Git (maintenance)

```bash
# Depuis la racine du projet
git status
git add .
git commit -m "chore: maj README + correctifs"
git push origin main

# Si vous changez register-commands.js (à faire en local)
npm run register
```

---

## 9) Permissions & visibilité (détails)

- Tous les salons créés par le bot sont **privés** : `@everyone` → `ViewChannel` refusé.
- Accès accordé à :
  - ADMIN_ROLE_ID
  - MEMBERS_ROLE_ID
  - Rôle projet (créé à la volée, nommé `PROJET — <Nom>`)
  - Bot (droits complets de gestion)
- Le vocal du projet est supprimé à l’archivage et recréé au désarchivage.
- Le rôle projet est supprimé à l’archive/delete, recréé à l’unarchive.

> Le bot n’hérite pas des permissions de la catégorie : les **overwrites** sont appliqués explicitement sur chaque salon pour garantir la confidentialité.

---

## 10) Mapping des salons d’un projet

- BANNIÈRE : nom `🔴 ═════ NOM ═════ 🔴` (couleur aléatoire parmi 7), `topic` inclut `PROJECT:<slug> | ROLE:<id> | TAG:BANNER`  
- TEXTE : `brief`, `discussion`, `ressources`, `livrables`, `retours` (topic avec `PROJECT:<slug>` et `TAG:<TYPE>`)  
- VOCAL : `vocal – réunion・p-<slug>` (pas de topic, identifié par le nom)

> `slug` = nom normalisé (minuscules, sans accents, espaces → `-`).

---

## 11) Dépannages fréquents

**Le bot répond “OK” mais rien ne se crée**  
- Vérifiez que le bot a **Administrator** (ou au minimum **Manage Channels** & **Manage Roles**).  
- Vérifiez Paramètres du serveur → **Intégrations** → votre bot → **Permissions**.  
- Les catégories actives/archives existent (le bot les crée si absentes).

**`Invalid bitfield flag or number: undefined.`**  
- Votre version de `discord.js` ne connaît pas un droit (ex. `CreatePolls`).  
- Dans ce dépôt, les flags sont filtrés avant application (pas d’impact).

**`Missing Access` / `Missing Permissions`**  
- Le bot doit être **au-dessus** des rôles qu’il essaye de gérer. Placez son rôle en haut de la pile.

**Les commandes `/archive` ou `/delete` n’agissent pas sur les salons**  
- Ce bot identifie les salons texte via le **topic** contenant `PROJECT:<slug>`.  
- Si vous avez renuméroté/renommé manuellement, le topic reste la clé.

---

## 12) Structure des fichiers

```
project-manager-bot/
│
├── index.js                 # logique du bot
├── register-commands.js     # enregistrement des slash commands
├── package.json
├── package-lock.json
├── .env                     # local uniquement (non versionné)
├── .env.example
└── README.md
```

---

## 13) Script `package.json`

```json
{
  "name": "project-manager-bot",
  "version": "1.0.0",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "register": "node register-commands.js"
  },
  "dependencies": {
    "discord.js": "^14.24.2",
    "dotenv": "^16.6.1"
  }
}
```

---

## 14) Sécurité

- **Ne committez jamais** votre `.env`. Utilisez `.env.example` comme modèle.
- Révoquez le **Token** du bot si vous pensez l’avoir exposé par erreur (onglet **Bot** → **Reset Token**).

---

## 15) Roadmap (idées)

- Désarchiver en conservant le même rôle si toujours présent.
- Numérotation auto des projets / préfixes.
- Logs centralisés dans un salon staff.

---

Made by Lauris + friends ✦
