import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  durationMsFromTime,
  parseJUnit,
  truncateMessage,
  type ParsedTestCase,
} from "../../src/ingest/junit.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/junit/${name}`, import.meta.url), "utf8");

/** Parses a report that must be valid and returns its test cases. */
function cases(xml: string): ParsedTestCase[] {
  const result = parseJUnit(xml);
  if (!result.ok) throw new Error(`expected a valid report, got: ${result.message}`);
  return result.cases;
}

/** Parses a report that must be invalid and returns the error message. */
function rejection(xml: string): string {
  const result = parseJUnit(xml);
  if (result.ok) throw new Error(`expected an invalid report, got ${result.cases.length} cases`);
  return result.message;
}

const suite = (body: string, attrs = 'name="cart" file="tests/cart.test.ts"') =>
  `<testsuite ${attrs}>${body}</testsuite>`;

describe("result mapping", () => {
  it("REQ-ING-02: passing, <failure>, <error>, and <skipped> test cases become passed, failed, failed, and skipped", () => {
    const parsed = cases(
      suite(`
        <testcase name="passes"/>
        <testcase name="fails"><failure message="boom"/></testcase>
        <testcase name="errors"><error message="crash"/></testcase>
        <testcase name="skips"><skipped/></testcase>`),
    );
    expect(parsed.map((c) => [c.name, c.status])).toEqual([
      ["passes", "passed"],
      ["fails", "failed"],
      ["errors", "failed"],
      ["skips", "skipped"],
    ]);
  });

  it("REQ-ING-02: a test case with both <skipped> and <failure> is failed", () => {
    const [skippedFirst, failureFirst] = cases(
      suite(`
        <testcase name="a"><skipped/><failure message="x"/></testcase>
        <testcase name="b"><error message="y"/><skipped message="later"/></testcase>`),
    );
    expect(skippedFirst?.status).toBe("failed");
    expect(failureFirst?.status).toBe("failed");
  });

  it("REQ-ING-02: other child elements such as <system-out> and <properties> don't change the status", () => {
    const [only] = cases(
      suite(
        `<testcase name="a"><properties><property name="k" value="v"/></properties><system-out>log</system-out><system-err>warn</system-err></testcase>`,
      ),
    );
    expect(only?.status).toBe("passed");
  });
});

describe("report structure", () => {
  const body = `
    <testcase name="cart > updates total" classname="cart" file="tests/cart.test.ts" time="0.5"><failure message="off by 2"/></testcase>
    <testcase name="cart > removes an item" classname="cart" file="tests/cart.test.ts" time="0.1"/>`;

  it("REQ-ING-03: a <testsuites> root and a single <testsuite> root with the same test cases give identical results", () => {
    const wrapped = cases(
      `<?xml version="1.0"?><testsuites><testsuite name="cart">${body}</testsuite></testsuites>`,
    );
    const single = cases(`<?xml version="1.0"?><testsuite name="cart">${body}</testsuite>`);
    expect(wrapped).toHaveLength(2);
    expect(wrapped).toEqual(single);
  });

  it("REQ-ING-03: test cases in nested <testsuite> elements are found, in document order", () => {
    const parsed = cases(`
      <testsuites>
        <testsuite name="outer">
          <testcase name="one"/>
          <testsuite name="inner">
            <testcase name="two"/>
            <testsuite name="innermost"><testcase name="three"/></testsuite>
          </testsuite>
          <testcase name="four"/>
        </testsuite>
        <testsuite name="second"><testcase name="five"/></testsuite>
      </testsuites>`);
    expect(parsed.map((c) => c.name)).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("REQ-ING-03: every test case gets its 1-based position in the whole report (decision PQ-19)", () => {
    const parsed = cases(`
      <testsuites>
        <testsuite name="a"><testcase name="one"/><testsuite name="b"><testcase name="two"/></testsuite></testsuite>
        <testsuite name="c"><testcase name="three"/></testsuite>
      </testsuites>`);
    expect(parsed.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it("REQ-ING-03: reads reports in the shapes Vitest, pytest, Maven Surefire, and jest-junit write", () => {
    expect(cases(fixture("vitest.xml")).map((c) => [c.classname, c.name, c.status])).toEqual([
      ["tests/cart.test.ts", "cart > updates total", "failed"],
      ["tests/cart.test.ts", "cart > removes an item", "passed"],
      ["tests/cart.test.ts", "cart > applies a coupon", "skipped"],
      ["tests/search.test.ts", "search > paginates results", "passed"],
    ]);
    expect(
      cases(fixture("pytest.xml")).map((c) => [c.file, c.classname, c.name, c.status]),
    ).toEqual([
      ["tests/test_orders.py", "tests.test_orders", "test_exports_csv", "failed"],
      ["tests/test_orders.py", "tests.test_orders", "test_lists_orders", "passed"],
      ["tests/test_payments.py", "tests.test_payments", "test_refunds_partial", "failed"],
    ]);
    expect(
      cases(fixture("surefire.xml")).map((c) => [c.file, c.classname, c.name, c.status]),
    ).toEqual([
      ["", "com.shoplite.profile.AvatarTest", "uploadsAvatar", "failed"],
      ["", "com.shoplite.profile.AvatarTest", "rejectsLargeFiles", "passed"],
    ]);
    expect(cases(fixture("jest-junit.xml")).map((c) => [c.file, c.name])).toEqual([
      ["src/checkout/address.test.js", "checkout validates address"],
      ["src/checkout/shipping.test.js", "checkout shows shipping options"],
    ]);
  });
});

describe("test case identity", () => {
  it("REQ-ING-04: file and classname fall back to the enclosing <testsuite>'s file and name", () => {
    const [only] = cases(
      `<testsuite name="cart" file="tests/cart.test.ts"><testcase name="cart > updates total"/></testsuite>`,
    );
    expect(only).toMatchObject({
      file: "tests/cart.test.ts",
      classname: "cart",
      name: "cart > updates total",
    });
  });

  it("REQ-ING-04: the test case's own file and classname win over the suite's", () => {
    const [only] = cases(
      suite(`<testcase name="x" classname="cart.Totals" file="tests/totals.test.ts"/>`),
    );
    expect(only).toMatchObject({ file: "tests/totals.test.ts", classname: "cart.Totals" });
  });

  it("REQ-ING-04: the nearest enclosing suite is used, so an inner suite overrides an outer one", () => {
    const [inner, outer] = cases(`
      <testsuite name="outer" file="tests/outer.test.ts">
        <testsuite name="inner" file="tests/inner.test.ts"><testcase name="a"/></testsuite>
        <testcase name="b"/>
      </testsuite>`);
    expect(inner).toMatchObject({ file: "tests/inner.test.ts", classname: "inner" });
    expect(outer).toMatchObject({ file: "tests/outer.test.ts", classname: "outer" });
  });

  it("REQ-ING-04: with no file or classname anywhere, both are empty strings", () => {
    const [only] = cases(
      `<testsuites><testsuite><testcase name="lonely"/></testsuite></testsuites>`,
    );
    expect(only).toMatchObject({ file: "", classname: "", name: "lonely" });
  });

  it("REQ-ING-04: names, files, and classnames are kept exactly as written, with XML entities decoded", () => {
    const [only] = cases(
      suite(
        `<testcase name=" cart &gt; adds &amp; removes &quot;gift&quot; " classname="Cart&lt;T&gt;" file="tests/cart &amp; co.test.ts"/>`,
      ),
    );
    expect(only).toMatchObject({
      name: ' cart > adds & removes "gift" ',
      classname: "Cart<T>",
      file: "tests/cart & co.test.ts",
    });
  });

  it("REQ-ING-04: test cases that differ only in name stay separate", () => {
    const parsed = cases(suite(`<testcase name="a"/><testcase name="b"/>`));
    expect(parsed.map((c) => `${c.file}|${c.classname}|${c.name}`)).toEqual([
      "tests/cart.test.ts|cart|a",
      "tests/cart.test.ts|cart|b",
    ]);
  });

  it("REQ-ING-04: when the third <testcase> has no name, the report is rejected with a message mentioning test case 3", () => {
    const message = rejection(
      suite(`<testcase name="one"/><testcase name="two"/><testcase classname="x"/>`),
    );
    expect(message).toMatch(/test case 3\b/i);
  });

  it("REQ-ING-04: an empty or blank name is rejected like a missing one (decision PQ-23)", () => {
    expect(rejection(suite(`<testcase name=""/>`))).toMatch(/test case 1\b/i);
    expect(rejection(suite(`<testcase name="ok"/><testcase name="   "/>`))).toMatch(
      /test case 2\b/i,
    );
  });

  it("REQ-ING-04: positions count across nested suites in document order (decision PQ-19)", () => {
    const message = rejection(`
      <testsuites>
        <testsuite name="a"><testcase name="1"/><testsuite name="b"><testcase name="2"/><testcase name="3"/></testsuite></testsuite>
        <testsuite name="c"><testcase name="4"/><testcase/></testsuite>
      </testsuites>`);
    expect(message).toMatch(/test case 5\b/i);
  });
});

describe("recorded details", () => {
  it('REQ-ING-05: time="2.3456" with <failure message="Timeout after 5000ms"> gives 2346 ms and that message', () => {
    const [only] = cases(
      suite(
        `<testcase name="a" time="2.3456"><failure message="Timeout after 5000ms">stack trace</failure></testcase>`,
      ),
    );
    expect(only).toMatchObject({ durationMs: 2346, message: "Timeout after 5000ms" });
  });

  it('REQ-ING-05: time="0.0005" gives 1 ms', () => {
    const [only] = cases(suite(`<testcase name="a" time="0.0005"/>`));
    expect(only?.durationMs).toBe(1);
  });

  it("REQ-ING-05: durations are seconds × 1000, rounded half up", () => {
    expect(durationMsFromTime("1")).toBe(1000);
    expect(durationMsFromTime("0.0004")).toBe(0);
    expect(durationMsFromTime("0.0015")).toBe(2);
    expect(durationMsFromTime("12.5")).toBe(12500);
    expect(durationMsFromTime("0.431")).toBe(431);
    expect(durationMsFromTime("1.0005")).toBe(1001);
    expect(durationMsFromTime("1e-3")).toBe(1);
    expect(durationMsFromTime(" 0.2 ")).toBe(200);
    expect(durationMsFromTime("0")).toBe(0);
  });

  it("REQ-ING-05: a missing time, or one that isn't a number of seconds ≥ 0, gives 0 (decision PQ-23)", () => {
    for (const time of [undefined, "", "  ", "abc", "1,5", "NaN", "Infinity", "-1", "-0.5", "1s"]) {
      expect(durationMsFromTime(time), String(time)).toBe(0);
    }
    const [missing, invalid] = cases(suite(`<testcase name="a"/><testcase name="b" time="soon"/>`));
    expect(missing?.durationMs).toBe(0);
    expect(invalid?.durationMs).toBe(0);
  });

  it("REQ-ING-05: without a message attribute, the message is the element's text, trimmed (decision PQ-12d)", () => {
    const [failure, error, cdata] = cases(
      suite(`
        <testcase name="a"><failure>
          expected 3 to be 4
            at cart.test.ts:12
        </failure></testcase>
        <testcase name="b"><error>  ECONNREFUSED  </error></testcase>
        <testcase name="c"><failure><![CDATA[x < y && y > z]]></failure></testcase>`),
    );
    expect(failure?.message).toBe("expected 3 to be 4\n            at cart.test.ts:12");
    expect(error?.message).toBe("ECONNREFUSED");
    expect(cdata?.message).toBe("x < y && y > z");
  });

  it("REQ-ING-05: a message attribute is kept as written, with entities decoded", () => {
    const [only] = cases(
      suite(
        `<testcase name="a"><failure message=" expected &quot;a&quot; &amp; got &lt;b&gt; ">text</failure></testcase>`,
      ),
    );
    expect(only?.message).toBe(' expected "a" & got <b> ');
  });

  it("REQ-ING-05: a failure with no message attribute and no text has no message (decision PQ-12d)", () => {
    const parsed = cases(
      suite(
        `<testcase name="a"><failure/></testcase><testcase name="b"><error>   </error></testcase><testcase name="c"><failure message=""/></testcase>`,
      ),
    );
    expect(parsed.map((c) => [c.status, c.message])).toEqual([
      ["failed", null],
      ["failed", null],
      ["failed", null],
    ]);
  });

  it("REQ-ING-05: passed and skipped results have no message, even if <skipped> has one", () => {
    const parsed = cases(
      suite(
        `<testcase name="a"><system-out>hello</system-out></testcase><testcase name="b"><skipped message="not on CI"/></testcase>`,
      ),
    );
    expect(parsed.map((c) => c.message)).toEqual([null, null]);
  });

  it("REQ-ING-05: a failed result that is also skipped takes its message from the <failure>", () => {
    const [only] = cases(
      suite(
        `<testcase name="a"><skipped message="skip"/><failure message="real reason"/></testcase>`,
      ),
    );
    expect(only?.message).toBe("real reason");
  });

  it("REQ-ING-05: with several <failure>/<error> elements, the first one's message is used", () => {
    const [only] = cases(
      suite(`<testcase name="a"><error message="first"/><failure message="second"/></testcase>`),
    );
    expect(only?.message).toBe("first");
  });

  it("REQ-ING-05: messages are truncated to 2,000 characters, counted in code points", () => {
    const long = `${"x".repeat(1999)}😀😀😀`;
    const [only] = cases(suite(`<testcase name="a"><failure message="${long}"/></testcase>`));
    expect(only?.message).toBe(`${"x".repeat(1999)}😀`);
    expect([...(only?.message ?? "")]).toHaveLength(2000);
  });

  it("REQ-ING-05: truncateMessage leaves short messages alone and never splits a code point", () => {
    expect(truncateMessage("short")).toBe("short");
    expect(truncateMessage("a".repeat(2000))).toBe("a".repeat(2000));
    expect(truncateMessage("😀😀😀", 2)).toBe("😀😀");
    expect(truncateMessage("abcdef", 3)).toBe("abc");
  });

  it("REQ-ING-05: reads durations and messages from real-world report shapes", () => {
    const [vitestFailure] = cases(fixture("vitest.xml"));
    expect(vitestFailure).toMatchObject({
      durationMs: 431,
      message: "expected 42 to be 40 // Object.is equality",
    });
    const [, , pytestError] = cases(fixture("pytest.xml"));
    expect(pytestError).toMatchObject({
      durationMs: 453,
      message: 'failed on setup with "ConnectionRefusedError: [Errno 111] Connection refused"',
    });
    const [surefireFailure] = cases(fixture("surefire.xml"));
    expect(surefireFailure).toMatchObject({ durationMs: 1205, message: "Timeout after 5000ms" });
  });
});

describe("repeated test cases", () => {
  it("REQ-ING-06: cart > updates total appearing twice, failing then passing, gives two results in that order", () => {
    const parsed = cases(
      suite(`
        <testcase name="cart > updates total"><failure message="flaked"/></testcase>
        <testcase name="cart > removes an item"/>
        <testcase name="cart > updates total"/>`),
    );
    const repeated = parsed.filter((c) => c.name === "cart > updates total");
    expect(repeated.map((c) => [c.position, c.status])).toEqual([
      [1, "failed"],
      [3, "passed"],
    ]);
  });
});

describe("invalid reports", () => {
  it("REQ-ING-08: a truncated XML file is rejected", () => {
    const whole = fixture("vitest.xml");
    expect(rejection(whole.slice(0, Math.floor(whole.length / 2)))).not.toBe("");
  });

  it("REQ-ING-08: XML that isn't well-formed is rejected", () => {
    for (const xml of [
      "",
      "   ",
      "not xml at all",
      `<testsuite name="a"><testcase name="x"></testsuite>`,
      `<testsuite name="a"><testcase name="x"/></testsuite><testsuite name="b"/>`,
      `<testsuite name="a" name="b"><testcase name="x"/></testsuite>`,
      `<testsuite name="a"><testcase name="x & y"/></testsuite>`,
    ]) {
      expect(parseJUnit(xml).ok, JSON.stringify(xml)).toBe(false);
    }
  });

  it("REQ-ING-08: a report whose root isn't <testsuite> or <testsuites> is rejected", () => {
    for (const xml of [
      `<results><testcase name="x"/></results>`,
      `<testcase name="x"/>`,
      `<TestSuite name="a"><testcase name="x"/></TestSuite>`,
    ]) {
      expect(parseJUnit(xml).ok, xml).toBe(false);
    }
  });

  it("REQ-ING-08: a well-formed <testsuite> with zero <testcase> elements is rejected", () => {
    expect(rejection(`<testsuite name="empty" tests="0"></testsuite>`)).not.toBe("");
    expect(
      parseJUnit(`<testsuites><testsuite name="a"/><testsuite name="b"/></testsuites>`).ok,
    ).toBe(false);
    expect(parseJUnit(`<testsuites/>`).ok).toBe(false);
  });

  it("REQ-ING-08: a comment, processing instruction, or BOM before the root is fine", () => {
    expect(
      cases(
        `\uFEFF<?xml version="1.0"?>\n<!-- generated --><testsuite name="a"><testcase name="x"/></testsuite>`,
      ),
    ).toHaveLength(1);
  });

  it("REQ-ING-08: every rejection explains the problem in a message", () => {
    for (const xml of [`<testsuite`, `<results/>`, `<testsuite name="a"/>`]) {
      expect(rejection(xml).length).toBeGreaterThan(10);
    }
  });
});
