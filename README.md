# Budsjett

Et privat økonomiverktøy for familien som lar dere følge opp utgifter, abonnementer, lån, investeringer og egendefinerte sider. Appen består av en Node-baseret API og et React-grensesnitt bygget med Vite. All data lagres lokalt i `server/data/store.json`, og kan når som helst eksporteres/importeres som JSON.

## Funksjoner

- Registrer inntekter og utgifter, kategoriser dem og legg på tags/notater.
- Opprett egne sider (f.eks. aksjer, fond, lån) og koble transaksjoner til sidene.
- Full oversikt over totalsummer per kategori og side, samt grafer og statistikk.
- Fri redigering av alle felt – alt kan endres og slettes.
- Eksport/import av all informasjon for manuell sikkerhetskopi.
- Leveres med Dockerfile slik at den kan startes i ZimaOS eller andre miljøer ved å angi ønsket port.

## Kom i gang lokalt

1. Installer avhengigheter:

   ```bash
   npm install
   cd client && npm install
   ```

2. Start utviklingsmiljø (Express API på port 4173 + Vite-klient på 5173 med proxy):

   ```bash
   npm run dev
   ```

3. Åpne `http://localhost:5173` i nettleseren.

### Produksjonsbygg

Bygg React-klienten og start serveren som serverer de ferdige filene:

```bash
npm run build
npm start
```

Serveren vil bruke `PORT`-miljøvariabelen (standard 4173).

### Docker

Bygg og start et container-image:

```bash
docker build -t budsjett .
docker run -p 4173:4173 -v $(pwd)/server/data:/app/server/data budsjett
```

Bind-mounten gjør at datafilen deles mellom container og host.

## Import / eksport

Bruk "Import/Export"-siden i appen for å laste ned eller laste opp en JSON-fil. Import overskriver alle eksisterende data, så ta gjerne en eksport først.

## Strukturen i repositoriet

```
├── Dockerfile
├── client/        # Vite + React-grensesnitt
├── package.json   # Server + scripts
├── server/
│   ├── data/      # Lokal lagringsfil (git-ignorert)
│   ├── db.js      # Enkel filbasert database
│   └── index.js   # API og statisk tjener
└── README.md
```

Data lagres lokalt og deles ikke med andre. Appen er derfor tilpasset privat familiebruk.
