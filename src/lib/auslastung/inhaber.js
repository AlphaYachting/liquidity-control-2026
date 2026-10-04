// Auslastungsforecast ist ausschließlich für diese Person sichtbar
export const INHABER_EMAIL = 'a.rittler@rittler.co';
export const istInhaber = (user) => (user?.email || '').toLowerCase() === INHABER_EMAIL;