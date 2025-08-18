require('./settings');
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');
const app = express()

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'view')));

// ========================= FILE JSON ==========================
const panelPath = path.join(__dirname, "panel.json");
const vpsPath = path.join(__dirname, "vps.json");

// ============ UTILS PLAN PANEL & VPS ============
function getPlans() {
  return JSON.parse(fs.readFileSync(panelPath, "utf-8"));
}
function getPlanById(id) {
  const plans = getPlans();
  return plans.find(p => p.id === Number(id)) || null;
}
function getVpsPlans() {
  return JSON.parse(fs.readFileSync(vpsPath, "utf-8"));
}
function getVpsById(id) {
  const vps = getVpsPlans();
  return vps.find(p => p.id === Number(id)) || null;
}

function getVpsPlans() {
  const data = fs.readFileSync(vpsPath, "utf-8");
  return JSON.parse(data);
}

// Fungsi ambil semua Panel plans
function getPanelPlans() {
  const data = fs.readFileSync(panelPath, "utf-8");
  return JSON.parse(data);
}

function generateRandomPassword() {
  return Math.random().toString(36).substr(2, 8);
}

// ========================= EMAIL ==========================
function sendEmail(email, user, password, server) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: `${global.email}`,
      pass: `${global.pw}`
    }
  });

  let mailOptions = {
    from: `${global.email}`,
    to: email,
    subject: 'Account and Server Details',
    html: `
      <h3>Hi ${user.username},</h3>
      <p>Your account and server have been successfully created. Here are the details:</p>
      <ul>
          <li><strong>Username:</strong> ${user.username}</li>
          <li><strong>Password:</strong> ${password}</li>
          <li><strong>Server Memory:</strong> ${server.limits.memory} MB</li>
          <li><strong>Server Disk:</strong> ${server.limits.disk} MB</li>
          <li><strong>Server CPU:</strong> ${server.limits.cpu}%</li>
      </ul>
      <p>Please login to your server using the following URL: ${global.domain}</p>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Email sent:", info.response);
  });
}

function sendEmailVps(email, hostname, ip, password, image, size, region) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: `${global.email}`,
      pass: `${global.pw}`
    }
  });

  let mailOptions = {
    from: `${global.email}`,
    to: email,
    subject: 'VPS Details',
    html: `
      <h3>Hi,</h3>
      <p>Your VPS has been successfully created. Here are the details:</p>
      <ul>
          <li><strong>Hostname:</strong> ${hostname}</li>
          <li><strong>IpV4:</strong> ${ip}</li>
          <li><strong>Password:</strong> ${password}</li>
          <li><strong>Image:</strong> ${image}</li>
          <li><strong>Size:</strong> ${size}</li>
          <li><strong>Region:</strong> ${region}</li>
      </ul>
      <p>Thank you for your purchase.</p>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Email sent:", info.response);
  });
}

// ========================= VPS CREATE ==========================
async function createVPS({ email, hostname, size, image, region }) {
  let password = generateRandomPassword();

  let dropletData = {
    name: hostname.toLowerCase(),
    region,
    size,
    image,
    ssh_keys: null,
    backups: false,
    ipv6: true,
    user_data: `#cloud-config
password: ${password}
chpasswd: { expire: False }`,
    private_networking: null,
    volumes: null,
    tags: ["T"]
  };

  try {
    let response = await fetch("https://api.digitalocean.com/v2/droplets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${global.apido}`
      },
      body: JSON.stringify(dropletData)
    });

    let responseData = await response.json();
    if (!response.ok) throw new Error(`Gagal membuat VPS: ${responseData.message}`);

    let dropletId = responseData.droplet.id;

    console.log(`VPS sedang diproses...`);
    await new Promise(resolve => setTimeout(resolve, 60000));

    let dropletResponse = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${global.apido}`
      }
    });

    let dropletInfo = (await dropletResponse.json()).droplet;
    let ipVPS = dropletInfo.networks.v4?.[0]?.ip_address || "Tidak ada alamat IP";

    sendEmailVps(email, dropletInfo.name, ipVPS, password, image, size, region);

    return {
      success: true,
      data: {
        id: dropletId,
        ip: ipVPS,
        password,
        name: dropletInfo.name,
        region: dropletInfo.region.slug,
        size: dropletInfo.size_slug,
        image: dropletInfo.image.slug,
        status: dropletInfo.status
      }
    };

  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

// ========================= PANEL CREATE ==========================
async function createAccountAndServer(email, username, memory, disk, cpu) {
  try {
    let password = generateRandomPassword();
    let response = await fetch(`${global.domain}/api/application/users`, {
      method: 'POST',
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${global.ptla}`
      },
      body: JSON.stringify({
        email, username,
        first_name: username,
        last_name: username,
        language: "en",
        password
      })
    });

    let data = await response.json();
    if (data.errors) return;
    let user = data.attributes;

    let eggResponse = await fetch(`${global.domain}/api/application/nests/${global.nestid}/eggs/${global.egg}`, {
      method: 'GET',
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${global.ptla}`
      }
    });
    let eggData = await eggResponse.json();
    let startup_cmd = eggData.attributes.startup;

    let serverResponse = await fetch(`${global.domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${global.ptla}`
      },
      body: JSON.stringify({
        name: username,
        description: "Server Buyer",
        user: user.id,
        egg: parseInt(global.egg),
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_20",
        startup: startup_cmd,
        environment: {
          INST: "npm",
          USER_UPLOAD: "0",
          AUTO_UPDATE: "0",
          CMD_RUN: "npm start"
        },
        limits: { memory, swap: 0, disk, io: 500, cpu },
        feature_limits: { databases: 5, backups: 5, allocations: 1 },
        deploy: { locations: [parseInt(global.location)], dedicated_ip: false, port_range: [] }
      })
    });

    let serverData = await serverResponse.json();
    if (serverData.errors) return;
    let server = serverData.attributes;

    sendEmail(email, user, password, server);

  } catch (error) {
    console.error("Error:", error);
  }
}

// ========================= API ENDPOINT ==========================
// Buat pembayaran + order Panel
app.get('/api/create-panel', async (req, res) => {
  const { email, username, planId } = req.query;
  if (!email || !username || !planId) return res.status(400).json({ error: 'Parameter (email, username, planId) wajib.' });

  const plan = getPlanById(planId);
  if (!plan) return res.status(404).json({ error: 'Plan tidak ditemukan.' });

  try {
    const payUrl = `https://orderkuota-eight.vercel.app/api/orkut/createpayment?apikey=${global.apikey}&amount=${plan.price}&codeqr=${global.codeqr}`;
    const payment = await axios.get(payUrl);
    const payData = payment.data;
    if (!payData.status) return res.status(400).json({ error: 'Gagal membuat pembayaran.' });

    global.orders = global.orders || {};
    global.orders[payData.result.transactionId] = { type: "panel", email, username, memory: plan.memory, disk: plan.disk, cpu: plan.cpu, amount: plan.price, paid: false };

    res.status(200).json({ message: 'Silakan lakukan pembayaran.', transactionId: payData.result.transactionId, qrImage: payData.result.qrImageUrl, qrString: payData.result.qrString, expiration: payData.result.expirationTime });

  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan saat create pembayaran.' });
  }
});

// Buat pembayaran + order VPS
app.get('/api/create-vps', async (req, res) => {
  const { email, hostname, vpsId } = req.query;
  if (!email || !hostname || !vpsId) return res.status(400).json({ error: 'Parameter (email, hostname, vpsId) wajib.' });

  const vpsPlan = getVpsById(vpsId);
  if (!vpsPlan) return res.status(404).json({ error: 'VPS Plan tidak ditemukan.' });

  try {
    const payUrl = `https://orderkuota-eight.vercel.app/api/orkut/createpayment?apikey=${global.apikey}&amount=${vpsPlan.price}&codeqr=${global.codeqr}`;
    const payment = await axios.get(payUrl);
    const payData = payment.data;
    if (!payData.status) return res.status(400).json({ error: 'Gagal membuat pembayaran.' });

    global.orders = global.orders || {};
    global.orders[payData.result.transactionId] = { type: "vps", email, hostname, size: vpsPlan.size, image: vpsPlan.image, region: vpsPlan.region, amount: vpsPlan.price, paid: false };

    res.status(200).json({ message: 'Silakan lakukan pembayaran.', transactionId: payData.result.transactionId, qrImage: payData.result.qrImageUrl, qrString: payData.result.qrString, expiration: payData.result.expirationTime });

  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan saat create pembayaran VPS.' });
  }
});

// Cek status semua trx
app.get('/api/status/:trxid', async (req, res) => {
  const trxid = req.params.trxid;
  if (!global.orders || !global.orders[trxid]) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });

  try {
    const cekUrl = `https://orderkuota-eight.vercel.app/api/orkut/cekstatus?apikey=${global.apikey}&username=${global.userOrkut}&authtoken=${global.pwOrkut}`;
    const cek = await axios.get(cekUrl);
    const statusData = cek.data;
    if (!statusData.status) return res.status(400).json({ error: 'Gagal cek status pembayaran.' });

    let order = global.orders[trxid];
    if (statusData.data.transaction_status === "SUCCESS" && !order.paid) {
      order.paid = true;

      if (order.type === "panel") {
        await createAccountAndServer(order.email, order.username, order.memory, order.disk, order.cpu);
      } else if (order.type === "vps") {
        await createVPS({ email: order.email, hostname: order.hostname, size: order.size, image: order.image, region: order.region });
      }

      return res.status(200).json({ message: 'Pembayaran sukses, pesanan berhasil diproses.', data: statusData.data });
    }

    res.status(200).json({ message: 'Status pembayaran.', data: statusData.data });
  } catch (err) {
    res.status(500).json({ error: 'Error cek status pembayaran.' });
  }
});

app.get('/api/list-vps', (req, res) => {
  try {
    const vpsPlans = getVpsPlans();
    res.status(200).json({
      status: true,
      message: "Daftar VPS plans",
      data: vpsPlans
    });
  } catch (err) {
    res.status(500).json({ status: false, error: 'Gagal membaca file vps.json' });
  }
});

// Endpoint: List Panel
app.get('/api/list-panel', (req, res) => {
  try {
    const panelPlans = getPanelPlans();
    res.status(200).json({
      status: true,
      message: "Daftar Panel plans",
      data: panelPlans
    });
  } catch (err) {
    res.status(500).json({ status: false, error: 'Gagal membaca file panel.json' });
  }
});

// ========================= RUN SERVER ==========================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './view/index.html'));
});

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, './view/panel.html'));
});

app.get('/vps', (req, res) => {
    res.sendFile(path.join(__dirname, './view/vps.html'));
});

app.listen(3000, () => {
console.log("Server running on port 3000");
})
