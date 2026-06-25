require("dotenv").config();

const easProjectId = process.env.EAS_PROJECT_ID || "";

export default ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || "",
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
});
