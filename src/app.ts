import express from 'express'
import 'express-async-errors'
import helmet from 'helmet'
import morgan from 'morgan'
import { AuthRouter } from './auth/auth.router'
import { config } from './config'
import { container } from './container'

const app = express()

app.use(express.json())
app.use(morgan('dev'))
app.use(helmet())
app.get('/ping', (req, res) => {
    res.json({
        message: 'pong'
    })
})
app.use('/auth', AuthRouter)

container.initializeDatabase()

app.listen(config.PORT, () => console.log(`listening on port ${config.PORT}`))
