# 1.3.3 (30 Jul 2024)

- Updated `follow-redirects` to patch security vulnerability
- Updated `braces` to patch security vulnerability
- Updated `ws` to patch security vulnerability
- Removed `babel-plugin-transform-class-properties` to patch security vulnerability

# 1.3.2 (13 Jan 2024)

- Bumped dependencies
- Updated `follow-redirects` to patch security vulnerability

# 1.3.1 (4 Nov 2023)

- Bumped dependencies

# 1.3.0 (26 Sep 2023)

- `initialize` no longer sends an `initialized` statement if `sessionState` is provided
- Added `getInitializedDate` helper method

# 1.2.0 (24 Sep 2023)

- Added new optional parameter `authToken` to `initialize` (Fixes [https://github.com/xapijs/cmi5/issues/225](#225))
- Added new method `getAuthToken` (Fixes [https://github.com/xapijs/cmi5/issues/225](#225))
- Aligned with `@xapi/xapi/2.2.3`
- Bumped dependencies

# 1.1.6 (29 Dec 2022)

- Bumped dependencies
- Aligned with `@xapi/xapi@2.1.2`

# 1.1.5 (16 Dec 2022)

- Bumped dependencies to remove security warnings
- Fixed [#208](https://github.com/xapijs/cmi5/issues/208) (Thanks [fmeinhold](https://github.com/fmeinhold)!)

# 1.1.4 (6 Oct 2021)

- Bumped dependencies

# 1.1.3 (9 Sep 2021)

- Added npm version badge to readme
- Bumped `axios` to solve security vulnerability
- Bumped dependencies
- Added build step to automated tests

# 1.1.2 (14 Jul 2021)

- Aligned with `@xapi/xapi@1.2.1`
- Bumped dependencies

# 1.1.1 (25 May 2021)

- Added auto-generated `id` property to all statements
- Bumped dependencies

# 1.1.0 (20 Apr 2021)

- Added optional result success parameter to interaction methods
- Exposes xAPI wrapper with `cmi5.xapi` property

# 1.0.0 (9 Mar 2021)

- The officially stable launch of xAPI.js cmi5 Profile v1.0.0! 🎉
- Improved readme

# 0.4.1 (12 Jan 2021)

- Bumped `axios` to solve security vulnerability
- Bumped `node-notifier` to solve security vulnerability

# 0.4.0 (7 Dec 2020)

- Added singleton access through static `Cmi5.instance()` method

# 0.3.0 (22 Nov 2020)

- Added `moveOn` helper method to handle correct end sequence for AUs

# 0.2.0 (13 Oct 2020)

- Added `options` parameter to `pass`, `fail` and `complete` methods
- Added `transform` parameter to `options` to transform statements
- Added Prettier
- Added tests
- Added `isAuthenticated`, `isCmiAvailable` methods
- Bump `@xapi/xapi` version

# 0.1.0 (15 Sep 2020)

- Bump `@xapi/xapi` version
- Change usage of `fetch` to `axios`
- Improve rollup config

# 0.0.1 (28 May 2020)

- Initial version
