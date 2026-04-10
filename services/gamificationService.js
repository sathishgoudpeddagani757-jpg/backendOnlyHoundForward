const User = require('../models/User');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const daysBetween = (olderDate, newerDate) => {
  const older = startOfDay(olderDate).getTime();
  const newer = startOfDay(newerDate).getTime();
  return Math.round((newer - older) / MS_PER_DAY);
};

const uniqueBadges = (badges = []) => [...new Set((badges || []).filter(Boolean))];

const applyUploadEngagement = async ({ user, upload, profileCompleteness = 0 }) => {
  const now = new Date();
  const rewards = [];
  let pointsEarned = 20;

  rewards.push('Base upload reward');

  if ((upload.validation?.metadataCompleteness || 0) === 100) {
    pointsEarned += 10;
    rewards.push('Complete metadata bonus');
  }

  if (upload.validation?.submissionQuality === 'High') {
    pointsEarned += 15;
    rewards.push('High quality submission bonus');
  } else if (upload.validation?.submissionQuality === 'Acceptable') {
    pointsEarned += 5;
    rewards.push('Acceptable submission bonus');
  }

  if ((upload.healthScore || 0) >= 85) {
    pointsEarned += 10;
    rewards.push('Excellent health score bonus');
  }

  if (profileCompleteness === 100) {
    pointsEarned += 5;
    rewards.push('Complete profile bonus');
  }

  let streak = 1;
  if (user.lastUploadAt) {
    const diff = daysBetween(user.lastUploadAt, now);
    if (diff === 0) {
      streak = user.currentStreak || 1;
    } else if (diff === 1) {
      streak = (user.currentStreak || 0) + 1;
    } else {
      streak = 1;
    }
  }

  if (streak >= 7 && streak < 30) {
    pointsEarned += 15;
    rewards.push('7+ day streak bonus');
  }

  if (streak >= 30) {
    pointsEarned += 30;
    rewards.push('30+ day streak bonus');
  }

  const uploadCount = (user.uploadCount || 0) + 1;
  const badgesUnlocked = [];
  const badges = uniqueBadges(user.badges);

  const unlockBadge = (badgeName, condition) => {
    if (condition && !badges.includes(badgeName)) {
      badges.push(badgeName);
      badgesUnlocked.push(badgeName);
    }
  };

  unlockBadge('First Upload', uploadCount >= 1);
  unlockBadge('Week Warrior', streak >= 7);
  unlockBadge('Consistency King', streak >= 30);
  unlockBadge('Health Hero', (upload.healthScore || 0) >= 85);
  unlockBadge('Milestone Maker', uploadCount >= 10);

  user.totalPoints = (user.totalPoints || 0) + pointsEarned;
  user.currentStreak = streak;
  user.uploadCount = uploadCount;
  user.lastUploadAt = now;
  user.lastActiveAt = now;
  user.badges = badges;

  await user.save();

  const usersAhead = await User.countDocuments({
    totalPoints: { $gt: user.totalPoints }
  });
  const totalUsers = await User.countDocuments({ role: 'user' });
  const percentileRank = totalUsers > 0 ? ((usersAhead + 1) / totalUsers) * 100 : 100;

  if (percentileRank <= 10 && !user.badges.includes('Leaderboard Leader')) {
    user.badges = uniqueBadges([...user.badges, 'Leaderboard Leader']);
    badgesUnlocked.push('Leaderboard Leader');
    await user.save();
  }

  return {
    pointsEarned,
    streakAfterUpload: user.currentStreak,
    badgesUnlocked,
    rewards,
    totalPoints: user.totalPoints,
    badges: user.badges,
    uploadCount: user.uploadCount
  };
};

module.exports = {
  applyUploadEngagement
};
