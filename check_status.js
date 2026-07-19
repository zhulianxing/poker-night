const { query } = require("@poker-night/shared");
(async () => {
  const r = await query(
    "SELECT id,display_code,status FROM tournaments WHERE id=$1",
    ["32fab5d9-a80b-4814-aaf6-367cf5b435e9"]
  );
  console.log("Status:", JSON.stringify(r.rows[0]));
  process.exit();
})();
