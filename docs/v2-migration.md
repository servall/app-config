---
title: V2 Migration Guide
---

See the [release notes](./release-notes.md#version-2-v2-0-0) for a list of changes and features.

### Steps to migration from v1.x

1. Adjust the versions in all `package.json` files from `1` to `2` for `@app-config/main` and plugins.
1. Move any `app-config.{ext}` files to `.app-config.{ext}`
1. In Node.js applications, call the asynchronous `loadConfig` before accessing any config properties.
1. Find and variable substitutions (eg. `'$PORT'` in a string) and surround it with `$substitute`.
1. Make sure to look out for any usage of internal APIs of app-config. TypeScript should catch these.

As stated above, your main file should look like this:

```typescript
import config, { loadConfig } from '@app-config/main';

async function main() {
  await loadConfig();

  // after loadConfig is resolved (not just called!), `config` is accessible
  console.log(config);
}
```

This isn't a complete list, though it should cover most issues. You'll want to
test things out thoroughly before moving to v2 in production. One nice feature
is that you can install `@app-config/main@2` globally on your system, and run
it with CWD of your project:

```sh
yarn global add @app-config/main@2

app-config vars -C ~/dev/my-project
```

This is a good way to verify that config and schema loading works. Check the values it outputs.
Also check that your environment-specific variables are correct.

And of course, run your application in a variety of different configurations.
