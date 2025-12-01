# Tanösvény – Web2 beadandó

## Helyi futtatás (Windows / fejlesztés)
npm install
npm start
# http://localhost:4156

## Szerver telepítés (Neumann, IP: 143.47.98.96)
ssh student155@143.47.98.96

cd ~/app156     # ide került a projekt
npm install

# Node alkalmazás indítása 4156 porton
PORT=4156 pm2 start indito.js --name tanosveny --update-env
pm2 save

## Weboldal elérése
http://143.47.98.96/app156/
## Belépési adatok (teszt felhasználó)
Felhasználó: admin@local
Jelszó: Admin123!