import * as crypto from 'crypto'
import { compare, hash } from 'bcryptjs'
import moment from 'moment'
import { MqttClient } from 'mqtt'
import { append, evolve, map, omit, pick, pipe } from 'ramda'
import { GuestDetails, LoginInput } from '../auth/auth.interface'
import { ICheckInRepository } from '../checkIn/checkIn.repository'
import { sameDay } from '../checkIn/checkIn.utils'
import { Dependencies } from '../container'
import { DoorLockCodeDecodeInput, DoorLockCodeEncodeInput } from '../door/door.interface';
import { BadRequestError } from '../error/HttpError'
import { getGuestDetails } from '../guest/guest.utils'
import { Bed } from '../models/bed'
import { Reservation } from '../models/reservation'
import { renameKeys } from '../utils'
import {
    AdminRoomSearch,
    CheckInInfo,
    CheckInOutSummary,
    CheckOutInfo,
    CreateStaff,
    ReservationInfo,
    RoomMaintenance,
    StaffDetails
} from './admin.interface'
import { IAdminRespository } from './admin.repository'

export interface IAdminService {
    listReservations(from: Date, to: Date): Promise<ReservationInfo[]>
    registerStaff(data: CreateStaff): Promise<StaffDetails>
    loginStaff(data: LoginInput): Promise<StaffDetails>
    listGuests(page: number, size: number): Promise<GuestDetails[]>
    listCheckInCheckOut(page: number, size: number): Promise<CheckInOutSummary>
    getAllRooms(): Promise<AdminRoomSearch[]>
    getStaff(id: string): Promise<StaffDetails>
    getDoorLockInput(
        staffID: string,
    ): Promise<DoorLockCodeEncodeInput>
    dynamicTruncationFn(hmacValue: Buffer): number
    generateHOTP(secret: string, counter: number): number
    generateTOTP(secret: string, window: number): number
    encode(input: DoorLockCodeEncodeInput): string
    unlockDoor(roomID: string): void
    checkIn(reservationID: string, date: Date): Promise<Reservation>
    createRoomMaintenance(
        roomID: number,
        from: Date,
        to: Date,
        description?: string
    ): Promise<RoomMaintenance>
    listRoomMaintenance(from: Date, to: Date): Promise<RoomMaintenance[]>
    deleteRoomMaintenance(maintenanceID: number): Promise<RoomMaintenance>
}
export const stayDuration = (checkIn: Date, checkOut: Date) =>
    moment(checkOut).diff(moment(checkIn), 'days')
export class AdminService implements IAdminService {
    adminRepository: IAdminRespository
    mqttClient: MqttClient
    checkInRepository: ICheckInRepository
    constructor({
        adminRepository,
        mqttClient,
        checkInRepository
    }: Dependencies<IAdminRespository | MqttClient | ICheckInRepository>) {
        this.adminRepository = adminRepository
        this.mqttClient = mqttClient
        this.checkInRepository = checkInRepository
    }
    async listReservations(from: Date, to: Date) {
        const validDate = moment(from).isBefore(to, 'day')
        if (!validDate) {
            throw new BadRequestError(`Invalid Date.`)
        }
        const reservations = await this.adminRepository.listReservations(
            from,
            to
        )
        return map(
            pipe(
                pick([
                    'id',
                    'check_in',
                    'check_out',
                    'rooms',
                    'guest',
                    'special_requests'
                ]),
                evolve({
                    guest: getGuestDetails
                }),
                renameKeys({
                    check_in: 'checkIn',
                    check_out: 'checkOut',
                    special_requests: 'specialRequests'
                })
            )
        )(reservations) as ReservationInfo[]
    }

    async registerStaff(input: CreateStaff) {
        const hashed = await hash(input.password, 10)
        const staff = await this.adminRepository.createStaff({
            ...input,
            password: hashed
        })
        return omit(['password'], staff)
    }

    async loginStaff(input: LoginInput) {
        const staff = await this.adminRepository.findStaff({
            email: input.email
        })
        if (!staff) throw new BadRequestError('Wrong email or password.')
        const correct = await compare(input.password, staff.password)
        if (!correct) throw new BadRequestError('Wrong email or password.')
        return omit(['password'], staff)
    }
    async listGuests(page: number = 0, size: number = 25) {
        const guests = await this.adminRepository.listGuests(page, size)
        return map(getGuestDetails)(guests) as GuestDetails[]
    }

    async listCheckInCheckOut(page: number = 0, size: number = 25) {
        const [checkIn, checkOut] = await Promise.all([
            this.adminRepository.listCheckIns(page, size).then(
                map(
                    (r): CheckInInfo => {
                        const {
                            check_in,
                            check_out,
                            check_in_enter_time,
                            id,
                            guest
                        } = r
                        const nights = stayDuration(check_in, check_out)
                        const beds = r.beds!.length
                        return {
                            id,
                            beds,
                            nights,
                            guest: getGuestDetails(guest),
                            checkInTime: check_in_enter_time
                        } as CheckInInfo
                    }
                )
            ),
            this.adminRepository.listCheckOuts(page, size).then(
                map(
                    (r): CheckOutInfo => {
                        const {
                            check_in,
                            check_out,
                            check_out_exit_time,
                            id,
                            guest
                        } = r
                        const nights = stayDuration(check_in, check_out)
                        const beds = r.beds!.length
                        return {
                            id,
                            beds,
                            nights,
                            guest: getGuestDetails(guest),
                            checkOutTime: check_out_exit_time
                        } as CheckOutInfo
                    }
                )
            )
        ])
        return {
            checkIn,
            checkOut
        }
    }
    async getAllRooms() {
        const rooms = await this.adminRepository.getAllRooms()
        const roomsByType = rooms.reduce((acc, cur) => {
            const { type, id, beds, ...rest } = cur
            const old = acc[type] ?? { ...rest, rooms: [] }
            return {
                ...acc,
                [type]: {
                    ...old,
                    rooms: append({ id, beds: beds as Bed[] }, old.rooms)
                }
            }
        }, {} as { [key: string]: Omit<AdminRoomSearch, 'type'> })
        const result: AdminRoomSearch[] = []
        for (const type in roomsByType) {
            result.push({ ...roomsByType[type], type })
        }
        return result
    }
    async getStaff(id: string) {
        const staff = await this.adminRepository.findStaffById(id)
        if (!staff) {
            throw new BadRequestError('Invalid ID.')
        }
        return omit(['password'], staff)
    }

    dynamicTruncationFn(hmacValue: Buffer) {
        const offset = hmacValue[hmacValue.length - 1] & 0xf

        return (
            ((hmacValue[offset] & 0x7f) << 24) |
            ((hmacValue[offset + 1] & 0xff) << 16) |
            ((hmacValue[offset + 2] & 0xff) << 8) |
            (hmacValue[offset + 3] & 0xff)
        )
    }

    generateHOTP(secret: string, counter: number) {
        const decodedSecret = Buffer.from(secret, 'base64')
        const buffer = Buffer.alloc(8)
        for (let i = 0; i < 8; i++) {
            buffer[7 - i] = counter & 0xff
            counter = counter >> 8
        }
        const hmac = crypto.createHmac('sha1', Buffer.from(decodedSecret))
        hmac.update(buffer)
        const hmacResult = hmac.digest()
        const code = this.dynamicTruncationFn(hmacResult)
        return code % 10 ** 6 // 6 digit HOTP
    }

    generateTOTP(secret: string, window = 0) {
        const counter = Math.floor(Date.now() / 1000) // new code generated every 1 second per window
        return this.generateHOTP(secret, counter + window)
    }

    async getDoorLockInput(staffID: string) {
        const staff = await this.adminRepository.findStaffById(staffID)
        if (!staff)
            throw new BadRequestError('Request failed. Staff ID is invalid.')
        const dummyRoomID = '9999';
        const dummyStaffNationalID = '1234567890123';
        const secret = this.generateTOTP(
            staffID + dummyRoomID + dummyStaffNationalID,
            300
        ).toString() // valid for 300 windows
        return {
            userID: staffID,
            roomID: dummyRoomID,
            nationalID: dummyStaffNationalID,
            secret: secret.padStart(6, '0')
        }
    }

    encode(input: DoorLockCodeEncodeInput) {
        return (
            input.userID +
            '|' +
            input.roomID +
            '|' +
            input.nationalID +
            '|' +
            input.secret
        )
    }

    unlockDoor(roomID: string) {
        this.mqttClient.publish(`door/${roomID}`, 'unlock')
    }
    async checkIn(reservationID: string, date: Date) {
        const reservation = await this.checkInRepository.findReservationById(
            reservationID
        )
        if (!sameDay(date, reservation.check_in)) {
            throw new BadRequestError(`Can not chech in this day ${date}.`)
        }
        const photo = 'profile.jpeg'
        const record = await this.checkInRepository.createReservationRecord(
            reservationID,
            photo,
            { idCardPhoto: photo }
        )
        const updated = await this.checkInRepository.addCheckInTime(
            reservationID,
            date
        )
        return updated
    }
    async createRoomMaintenance(
        roomID: number,
        from: Date,
        to: Date,
        description?: string
    ) {
        const validDate = moment(from).isBefore(to, 'day')
        if (!validDate) {
            throw new BadRequestError(`Invalid Date.`)
        }
        const reservations = await this.listReservations(from, to)
        const hasReservations = reservations.length > 0
        if (hasReservations) {
            throw new BadRequestError(
                'Invalid date. There are reservations in this range of date.'
            )
        }
        const roomMaintenance = await this.adminRepository.createMaintenance(
            roomID,
            from,
            to,
            description
        )

        return renameKeys(
            { room_id: 'roomID' },
            roomMaintenance
        ) as RoomMaintenance
    }
    async listRoomMaintenance(from: Date, to: Date) {
        const validDate = moment(from).isBefore(to, 'day')
        if (!validDate) {
            throw new BadRequestError(`Invalid Date.`)
        }
        const maintenance = await this.adminRepository.listMaintenance(from, to)
        return map(
            renameKeys({ room_id: 'roomID' }),
            maintenance
        ) as RoomMaintenance[]
    }
    async deleteRoomMaintenance(maintenanceID: number) {
        const maintenance = await this.adminRepository.deleteMainenance(
            maintenanceID
        )
        return renameKeys({ room_id: 'roomID' }, maintenance) as RoomMaintenance
    }
}
