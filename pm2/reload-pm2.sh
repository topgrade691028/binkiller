cd ~/trade/bk-bot

npm install

# curl http://127.0.0.1/save

pm2 flush

npm run build

pm2 delete Binance-Killer-Bot

pm2 delete Binance-Killer-Bot-cstar

pm2 start pm2/start.json




cd ~/trade/bk-bot-cstar

npm install

# curl http://127.0.0.1/save

npm run build


pm2 start pm2/start-cstar.json



# pm2 delete Binance-Killer-Bot-cstar
# pm2 start pm2/start-cstar.json
