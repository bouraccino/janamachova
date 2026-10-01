# janamachova.cz

Web Ing. Jany Machové, soudní znalkyně pro obor ekonomika, odvětví ceny a odhady nemovitostí (Ostrava).

Statický web bez databáze a bez build kroku: jeden `index.html`, CSS, JS, fotky a písma. Nasadí se kamkoli, kde se dají hostovat soubory.

## Struktura

```
index.html        celý web (jedna stránka s kotvami)
404.html          chybová stránka
css/style.css     styly
css/fonts.css     @font-face pro lokálně hostovaná písma
fonts/            Archivo, Instrument Serif, IBM Plex Mono (woff2, latin + latin-ext)
img/              fotky Ostravy v několika velikostech (WebP) + og-image.jpg pro sdílení
js/main.js        animace, mobilní menu, parallax, kopírování kontaktů (web funguje i bez JS)
CNAME             doména pro GitHub Pages
robots.txt
```

## Úprava obsahu

Veškerý text je přímo v `index.html`, sekce jsou označené komentáři (`<!-- ===== HERO ===== -->` atd.).
Telefon, e‑mail a adresa jsou v hlavičce, v hero, v mobilním menu a v sekci Kontakt – při změně upravte všechna místa
(nebo vyhledejte `604 163 806`).

Fotky: nahraďte soubory v `img/` stejnými názvy, nebo upravte `srcset` u příslušného `<img>`.

## Nasazení (doporučeno: Cloudflare Pages nebo GitHub Pages, obojí zdarma)

Doména zůstává u stávajícího registrátora (ten, komu se platí ročně). Zruší se jen hosting WordPressu.

### GitHub Pages
1. Repozitář musí být veřejný (Settings → General → Change visibility), u soukromého vyžaduje placený plán.
2. Settings → Pages → Build and deployment: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Settings → Pages → Custom domain: `janamachova.cz`, zaškrtnout **Enforce HTTPS** (po ověření DNS).
4. U registrátora domény nastavit DNS:
   - `A` záznamy pro `janamachova.cz`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` pro `www` → `bouraccino.github.io`
5. Každý push do `main` web automaticky aktualizuje.

### Cloudflare Pages
1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → vybrat tento repozitář.
2. Build command prázdný, output directory `/`.
3. Custom domains → přidat `janamachova.cz` a `www.janamachova.cz`; Cloudflare ukáže potřebné DNS záznamy
   (CNAME na `<projekt>.pages.dev`), které se nastaví u registrátora, případně se k Cloudflare přesunou nameservery.

## Lokální náhled

```sh
python3 -m http.server 8080
```
a otevřít http://localhost:8080/.

## Poznámky k obsahu

Převzato z původního webu: úvod, představení, profil a kontakt. Články z tisku byly na přání majitelky vynechány,
stejně jako zmínka o budově katastrálního úřadu.

V sekci Kontakt je vložená mapa Google (iframe bez API klíče). Načítá se z google.com, tedy s cookies Googlu –
pokud by to vadilo, stačí iframe nahradit odkazem, který je pod mapou.
Nové sekce, které je dobré zkontrolovat s majitelkou: **Postup** a **Obvyklé podklady** (obecný popis),
a položka časové osy **2021 – zápis podle nového znaleckého zákona**.
