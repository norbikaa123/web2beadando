export function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/app156/login?next=' + encodeURIComponent(req.originalUrl || '/'));
}

export function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Hozzáférés megtagadva (admin szükséges).');
}