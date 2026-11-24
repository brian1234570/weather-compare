# Weather Compare

Compare live weather across multiple cities in one table. Add cities, then **sort** (click headers), **filter** (min/max temperature) and **search** (city or condition).
Built with Node.js/Express (backend proxy + cache) and vanilla HTML/CSS/JS.

- **Demo video:** `<ADD LINK>`
- **Live (load balancer):** http://3.10.233.134
- Web01: http://35.177.173.247 · Web02: http://18.132.97.141

## Features
- Multi-city comparison with sorting, filtering and searching
- API key kept server-side (never reaches the browser)
- 10-minute in-memory cache for API responses (bonus: performance)
- Input validation + XSS-safe rendering (bonus: security)
- Graceful errors: city not found, invalid key, rate limit, API timeout, network failure
- Footer shows which server answered, proving load balancing

## API used
**OpenWeatherMap** Current Weather API: https://openweathermap.org/current  
Credit to the OpenWeather team. Free key: https://home.openweathermap.org/users/sign_up

## Run locally
```bash
git clone https://github.com/brian1234570/weather-compare.git && cd weather-compare
npm install
cp .env.example .env        # then put your key in .env
npm start
# open http://localhost:3000
```

## Deploy to Web01 and Web02 (repeat on each)
```bash
ssh ubuntu@35.177.173.247   # Web01  (Web02: ubuntu@18.132.97.141)

# 1. Install Node 20, nginx, git
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# 2. Get the code
sudo git clone https://github.com/brian1234570/weather-compare.git /opt/weather-compare
sudo chown -R ubuntu:ubuntu /opt/weather-compare
cd /opt/weather-compare && npm install --omit=dev

# 3. Configure secrets (not in git)
cp .env.example .env && nano .env     # set OPENWEATHER_API_KEY

# 4. Run as a service
sudo cp weather-compare.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now weather-compare

# 5. nginx reverse proxy (port 80 -> 3000)
sudo cp nginx-web.conf /etc/nginx/sites-available/weather-compare
sudo ln -sf /etc/nginx/sites-available/weather-compare /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Verify: `curl http://localhost/api/health` returns `{"status":"ok"}`.
Make sure the cloud firewall / security group allows inbound port 80 (and 22 for SSH).

## Configure the load balancer (Lb01)
```bash
ssh ubuntu@3.10.233.134
sudo apt update && sudo apt install -y haproxy
sudo nano /etc/haproxy/haproxy.cfg    # append contents of haproxy.cfg.snippet
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy && sudo systemctl enable haproxy
```
Round-robin balancing, with `/api/health` checks so a dead server is removed automatically.

## Test load balancing
```bash
for i in 1 2 3 4 5 6; do curl -sI http://3.10.233.134/ | grep -i x-served-by; done
```
Output should alternate between the two hostnames. Also reload the site in the browser and watch the "Served by" footer change.
Failover test: `sudo systemctl stop weather-compare` on Web01, and the site must still work via Web02.

## Challenges and solutions
- **API key exposure:** moved all API calls to the backend; key lives in `.env` (git-ignored).
- **Rate limits / slow responses:** added a 10-minute cache and 8-second timeout.
- **Proving balancing:** added `X-Served-By` header and on-page server label.
- *(Add your own challenges here.)*

## Credits
OpenWeatherMap API · Express · dotenv · nginx · HAProxy
