export default async function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: "bot-finanzas-personales",
    routes: ["/health", "/telegram/webhook"]
  });
}
