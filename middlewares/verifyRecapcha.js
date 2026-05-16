const checkReCapcha = async(req, res, next) => {
  const { recaptcha:token, ...body } = req.body;
  req.body = body;
  if (!token) {
    return res.status(400).json({
      code: "error_recapcha",
      status: 400,
      message: "Falta token reCAPTCHA!.",
    });
  }

  const verify = await fetch(process.env.RECAPCHA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${process.env.RECARCHA_SECRET}&response=${token}`,
  });

  const data = await verify.json();

  if (!data.success) {
    return res.status(403).json({
      code: "invalid_recapcha",
      status: 403,
      message: "Verificación reCAPTCHA fallida!.",
    });
  }
  next();
};
module.exports = { checkReCapcha }