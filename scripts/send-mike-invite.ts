import { inviteDashboardMember } from '../server/admin-invite.js'

async function run() {
  console.log('Sending dashboard invite to Mike...')
  const result = await inviteDashboardMember({
    email: 'mike.rcccon@yahoo.com',
    phone: '+14352377373',
    name: 'Mike',
    temporaryPassword: 'Genie#Solar9482!',
    role: 'admin',
  })
  console.log('Result:', result)
}

run().catch((err) => {
  console.error('Failed to invite:', err)
  process.exit(1)
})
