# Azure App Registration for Microsoft Auth

The Electron launcher uses Microsoft's OAuth2 device code flow to authenticate players
with their Microsoft/Minecraft accounts. This requires a free Azure app registration tied
to your game.

Each game (e.g. "Kaden's Revenge") should have its own registration so players see your
game's name in the Microsoft login prompt.

---

## Step 1 — Create a Microsoft Azure account

Go to [portal.azure.com](https://portal.azure.com) and sign in with any Microsoft account
(personal or work). You do not need a paid subscription — the free tier covers everything
needed here.

---

## Step 2 — Register a new application

1. In the Azure portal, search for **"App registrations"** in the top search bar and open it.
2. Click **"New registration"**.
3. Fill in the form:
   - **Name**: Your game's name (e.g. `Kaden's Revenge Launcher`)
   - **Supported account types**: Select **"Personal Microsoft accounts only"**
     (this is the "Consumers" tenant — required for Xbox/Minecraft auth)
   - **Redirect URI**: Leave blank for now
4. Click **Register**.

You will land on the app's overview page. Copy the **Application (client) ID** — you'll
need it in your `pack.yaml`.

---

## Step 3 — Enable public client / device code flow

1. In the left sidebar, click **Authentication**.
2. Under **"Platform configurations"**, click **"Add a platform"**.
3. Choose **"Mobile and desktop applications"**.
4. You can leave all redirect URIs unchecked and click **Configure**.
5. Back on the Authentication page, scroll to the bottom to find **"Advanced settings"**.
6. Set **"Allow public client flows"** to **Yes**.
7. Click **Save**.

> **Tip:** The "Advanced settings" section only appears after at least one platform is
> configured. If you don't see it, make sure you completed steps 2–4 above.

This allows the device code flow (no redirect URI needed).

---

## Step 4 — Add Xbox Live API permission

1. In the left sidebar, click **API permissions**.
2. Click **"Add a permission"**.
3. Select the **"APIs my organization uses"** tab and search for **Xbox Live**.
   - If nothing appears, try searching for just **Xbox**.
   - If it still doesn't appear, select the **"Microsoft APIs"** tab and scroll down
     to the **"Supported legacy APIs"** section — Xbox Live is listed there.
4. Select **Delegated permissions** → check **XboxLive.signin**.
5. Click **Add permissions**.

> **Note:** In some newer Azure portal versions, Xbox Live may not appear at all in the
> API permissions browser. This is a known portal inconsistency. If you cannot find it,
> you can skip this step — the launcher requests the `XboxLive.signin` scope directly
> in the OAuth request, and Microsoft will prompt the user to consent at sign-in time
> without it needing to be pre-registered here.

> You do **not** need to click "Grant admin consent" — this delegated permission is
> granted by each user when they sign in.

---

## Step 5 — Add the client ID to your pack YAML

Open your `pack.yaml` and set the `azure_client_id` field:

```yaml
azure_client_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Replace the placeholder with the Application (client) ID you copied in Step 2.

---

## How it works at runtime

When a player clicks **Sign in with Microsoft** in the launcher:

1. The launcher calls Microsoft's device code endpoint using your client ID.
2. Microsoft returns a short code (e.g. `AB3X9K`) and a URL (`microsoft.com/devicelogin`).
3. The launcher displays the code. The player opens the URL in any browser, enters the
   code, and signs in with their Microsoft account.
4. The launcher polls Microsoft until sign-in completes, then automatically exchanges the
   token through Xbox Live → XSTS → Minecraft auth.
5. The player's Minecraft profile (username + UUID) is stored in memory for the session.

No passwords or tokens are stored to disk.

---

## Players without Minecraft Java Edition

If a player authenticates successfully but does not own Minecraft Java Edition, the
launcher will show: _"Failed to get Minecraft profile. Do you own Minecraft Java Edition?"_

The game requires a purchased copy of Minecraft Java Edition to play online.

---

## Offline / LAN play

If `azure_client_id` is omitted from `pack.yaml`, the sign-in button is replaced with a
notice that online auth is not configured. Players can still connect to LAN servers or
servers with `online-mode=false` — the launcher will launch with a placeholder token.

> Leaving `online-mode=false` on a public server is not recommended as it disables
> account verification.
