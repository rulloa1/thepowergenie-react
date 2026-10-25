import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseOptionBWorkflow } from '../src/hub/optionB'

const ROOT = 'private-assets/cust_patricia'
const BANNED = ['Ferrell', 'Hanna Ward', 'Hannah Ward', '206732844', 'AN14864224', '23929051', 'patricia-ferrell', '9896']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return [path]
  })
}

test('customer files stay in the private folder and the workflow json has no personal details', () => {
  const proposal = readFileSync(join(ROOT, 'sunrun-proposal.html'), 'utf8')
  const workflowRaw = readFileSync(join(ROOT, 'option-b.json'), 'utf8')
  assert.match(proposal, /Ferrell/)
  assert.doesNotMatch(proposal, /\/assets\/|\/documents\//)
  for (const needle of BANNED) assert.equal(workflowRaw.includes(needle), false, needle)
  for (const name of ['entergy-bill.png', 'solar-plan.jpg', 'footprint-plan.jpg']) {
    assert.ok(statSync(join(ROOT, name)).size > 10_000, name)
  }

  const workflow = parseOptionBWorkflow(workflowRaw, 'cust_patricia')
  assert.ok(workflow)
  assert.deepEqual(
    workflow.documents.map(document => document.path),
    [
      'customers/cust_patricia/sunrun-proposal.html',
      'customers/cust_patricia/solar-plan.jpg',
      'customers/cust_patricia/footprint-plan.jpg',
      'customers/cust_patricia/entergy-bill.png',
    ],
  )
  assert.equal(workflow.steps.some(step => step.description.includes('{{accountNumber}}')), true)
  assert.equal(workflow.steps.some(step => step.description.includes('{{address}}')), true)
})

test('the client, public site, and shared code do not contain the homeowner record', () => {
  const paths = [...files('src'), ...files('shared'), ...files('public')].filter(path =>
    /\.(ts|tsx|js|html|css|json|svg)$/.test(path) && !/\.test\.tsx?$/.test(path),
  )
  const paths = [...files('src'), ...files('shared'), ...files('public')].filter(path => /\.(ts|tsx|js|html|css|json|svg)$/.test(path) && !/\.test\.(ts|tsx|js)$/.test(path))
  const extra = ['cust_patricia', 'private-assets']
  for (const path of paths) {
    const text = readFileSync(path, 'utf8')
    for (const needle of [...BANNED, ...extra]) {
      assert.equal(text.includes(needle), false, `${path} contains ${needle}`)
    }
  }
  const config = readFileSync('vite.config.ts', 'utf8')
  assert.match(config, /private-assets/)
  assert.match(config, /publicDir: 'public'/)
})
