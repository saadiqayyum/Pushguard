import assert from "node:assert/strict"
import { test } from "node:test"
import { uninstallOrg } from "@/lib/jobs/uninstall"

const JOB = { type: "uninstall" as const, installationId: 7, org: "acme", by: "mallory" }

function deps(exists: boolean) {
  const calls: string[] = []
  return {
    calls,
    deps: {
      exists: async () => exists,
      alert: async () => void calls.push("alert"),
      wipe: async (org: string) => {
        calls.push(`wipe:${org}`)
        return {}
      },
      announce: async () => void calls.push("announce"),
    },
  }
}

test("the meta-alert is sent before the org's data is deleted", async () => {
  const { calls, deps: injected } = deps(true)
  await uninstallOrg(JOB, injected as never)
  assert.deepEqual(calls, ["alert", "wipe:acme", "announce"])
})

test("a repeat delivery, once the installation is gone, does nothing", async () => {
  const { calls, deps: injected } = deps(false)
  await uninstallOrg(JOB, injected as never)
  assert.deepEqual(calls, [])
})

test("a failed meta-alert stops the deletion, so the retry alerts again", async () => {
  const { calls, deps: injected } = deps(true)
  injected.alert = async () => {
    throw new Error("sink down")
  }
  await assert.rejects(() => uninstallOrg(JOB, injected as never), /sink down/)
  assert.deepEqual(calls, [])
})
