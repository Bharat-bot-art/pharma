function passwordIssues(pw) {
  const issues = [];
  if (!pw) {
    issues.push('required');
    return issues;
  }
  if (pw.length < 8) issues.push('At least 8 characters');
  if (!/[a-z]/.test(pw)) issues.push('A lowercase letter');
  if (!/[A-Z]/.test(pw)) issues.push('An uppercase letter');
  if (!/[0-9]/.test(pw)) issues.push('A number');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('A special character');
  return issues;
}

function isValidPassword(pw) {
  return passwordIssues(pw).length === 0;
}

function strength(pw) {
  let score = 0;
  if (!pw) return { score: 0, label: 'Too weak', level: 'weak' };
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length >= 16) score += 1;
  const levels = [
    { max: 2, label: 'Too weak', level: 'weak' },
    { max: 3, label: 'Weak', level: 'weak' },
    { max: 4, label: 'Fair', level: 'fair' },
    { max: 5, label: 'Good', level: 'good' },
    { max: 6, label: 'Strong', level: 'strong' },
  ];
  const matched = levels.find((l) => score <= l.max) || levels[levels.length - 1];
  return { score: Math.min(6, score), label: matched.label, level: matched.level };
}

module.exports = { passwordIssues, isValidPassword, strength };
