## 1. Derive keypair from either mnemonic or username/password

## 2. Meanwhile, build hub topology (hubmap)

Immediately when the daemon is started, fetch `hubs()` and connect to given `uri` to download and build the `hubmap`.

## 3.

As soon as the user logins, request few deterministically chosen hubs for `EncryptedBackup` by providing a hub-specific random `backup_key`.

If the backups are present, go to step 5.

## 4. Let the user choose hubs to join

Show user the list of all hubs in the system and let them sort by various parameters.
