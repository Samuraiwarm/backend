import {
    asClass,
    asFunction,
    asValue,
    createContainer,
    Lifetime,
    Resolver
} from 'awilix'
import { MqttClient } from 'mqtt'
import { AuthService, IAuthService } from './auth/auth.service'
import { IJwtService, JwtService } from './auth/jwt.service'
import {
    IVerificationTokenRepository,
    VerificationTokenRepository
} from './auth/verificationToken.repository'
import {
    CheckInRepository,
    ICheckInRepository
} from './checkIn/checkIn.repository'
import { CheckInService, ICheckInService } from './checkIn/checkIn.service'
import { config, Config } from './config'
import { InitializeDatabase, makeInitializeDatabase } from './db'
import { FileService, IFileService } from './files/file.service'
import { GuestRepository, IGuestRepository } from './guest/guest.repository'
import { IMailService, MailService } from './mail/mail.service'
import { connectMqtt, ConnectMqtt, mqttClient } from './mqtt'
import {
    IReservationRepository,
    ReservationRepository
} from './reservation/reservation.repository'
import {
    IReservationService,
    ReservationService
} from './reservation/reservation.service'
import { ICheckOutRepository, CheckOutRepository } from './checkOut/checkOut.repository'
import { ICheckOutService, CheckOutService } from './checkOut/checkOut.service'
import { DoorLockCodeService } from './door/door.service';
export interface AllDependencies {
    config: Config
    initializeDatabase: InitializeDatabase
    guestRepository: IGuestRepository
    verificationTokenRepository: IVerificationTokenRepository
    jwtService: IJwtService
    authService: IAuthService
    reservationRepository: IReservationRepository
    reservationService: IReservationService
    mqttClient: MqttClient
    connectMqtt: ConnectMqtt
    mailService: IMailService
    fileService: IFileService
    checkInRepository: ICheckInRepository
    checkInService: ICheckInService
    checkOutRespository:ICheckOutRepository
    checkOutService: ICheckOutService
    doorlockCodeService: DoorLockCodeService
}

type RegisterDeps<T> = {
    [P in keyof T]: Resolver<T[P]>
}

const DIContainer = createContainer()

const dependencies: RegisterDeps<AllDependencies> = {
    config: asValue(config),
    initializeDatabase: asFunction(makeInitializeDatabase),
    guestRepository: asClass(GuestRepository),
    verificationTokenRepository: asClass(VerificationTokenRepository),
    jwtService: asClass(JwtService),
    authService: asClass(AuthService),
    reservationRepository: asClass(ReservationRepository),
    reservationService: asClass(ReservationService),
    mqttClient: asFunction(mqttClient, { lifetime: Lifetime.SINGLETON }),
    connectMqtt: asFunction(connectMqtt),
    mailService: asClass(MailService),
    fileService: asClass(FileService),
    checkInRepository: asClass(CheckInRepository),
    checkInService: asClass(CheckInService),
    checkOutRespository: asClass(CheckOutRepository),
    checkOutService: asClass(CheckOutService),
    doorlockCodeService: asClass(DoorLockCodeService)
}

DIContainer.register(dependencies)

export const container = DIContainer.cradle as AllDependencies

type SubType<Base, Condition> = Pick<
    Base,
    {
        [Key in keyof Base]: Base[Key] extends Condition ? Key : never
    }[keyof Base]
>

export type Dependencies<Types> = SubType<AllDependencies, Types>
