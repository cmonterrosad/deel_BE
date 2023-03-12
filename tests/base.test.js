const request = require('supertest')
const app = require('../src/app')

describe('Initial Test', () => {
    it('should show all users', async () => {
        const res = await request(app).get('/contracts/:id')
        expect(res.statusCode).toEqual(401);
    }),
    it(' should not show contract only if it belongs to the profile calling ', async () => {
        const res = await request(app).get('/contracts/7').set({profile_id:1})
        expect(res.statusCode).toEqual(404);
    })
    it(' should show contract only if it belongs to the profile calling ', async () => {
        const res = await request(app).get('/contracts/1').set({profile_id:1})
        expect(res.statusCode).toEqual(200);
    })
})