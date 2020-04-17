import { Dependencies } from '../container'
import { BadRequestError, ForbiddenError } from '../error/HttpError'
import { GuestReservationRoom } from '../models/guestReservationRoom'
import { IReservationRepository } from '../reservation/reservation.repository'
import { IRoomRepository } from './room.repository'

export interface IRoomService {
    shareRoom(
        ownerID: string,
        email: string,
        reservationID: string,
        roomID: number
    ): Promise<GuestReservationRoom>
    findRoomsThatCanEnter(
        guestID: string,
        email: string,
        date: Date
    ): Promise<number[]>
    hasPermissionToEnterRoom(
        guestID: string,
        email: string,
        date: Date,
        roomID: number
    ): Promise<boolean>
}

export class RoomService implements IRoomService {
    roomRepository: IRoomRepository
    reservationRepository: IReservationRepository
    constructor({
        roomRepository,
        reservationRepository
    }: Dependencies<IRoomRepository | IReservationRepository>) {
        this.roomRepository = roomRepository
        this.reservationRepository = reservationRepository
    }
    async shareRoom(
        ownerID: string,
        email: string,
        reservationID: string,
        roomID: number
    ) {
        const isOwner = await this.checkIsReservationOwner(
            ownerID,
            reservationID
        )
        if (!isOwner) {
            throw new ForbiddenError(
                'Can not share room. You did not make this reservation.'
            )
        }
        return this.roomRepository.createGuestRoomReservation(
            email,
            reservationID,
            roomID
        )
    }
    async checkIsReservationOwner(guestID: string, reservationID: string) {
        const reservation = await this.roomRepository.findReservationById(
            reservationID
        )
        if (!reservation) {
            throw new BadRequestError('Invalid reservation id.')
        }
        return reservation.guest_id === guestID
    }

    async findRoomsThatCanEnter(guestID: string, email: string, date: Date) {
        const reservation = await this.roomRepository.findReservationIn(
            guestID,
            email,
            date
        )
        if (!reservation) {
            throw new BadRequestError('Not checked in.')
        }
        const isOwner = await this.checkIsReservationOwner(
            guestID,
            reservation.id
        )
        return isOwner
            ? await this.allRoomsInReservation(reservation.id)
            : [await this.roomShared(email, reservation.id)]
    }

    async allRoomsInReservation(reservationID: string) {
        const reservation = await this.reservationRepository.getReservation(
            reservationID
        )
        const rooms = reservation.rooms.map(({ id }) => id)
        return rooms
    }

    async roomShared(email: string, reservationID: string) {
        const shared = await this.roomRepository.findGuestRoomReservation(
            email,
            reservationID
        )
        return shared.room_id
    }

    async hasPermissionToEnterRoom(
        guestID: string,
        email: string,
        date: Date,
        roomID: number
    ) {
        const reservation = await this.roomRepository.findReservationIn(
            guestID,
            email,
            date
        )
        if (!reservation) {
            throw new BadRequestError('Not checked in.')
        }
        if (reservation.guest_id === guestID) {
            const rooms = await this.allRoomsInReservation(reservation.id)
            console.log(rooms)
            console.log(roomID)
            console.log(rooms.includes(roomID))
            console.log(typeof rooms[0])
            console.log(typeof roomID)
            console.log(rooms[0] === roomID)
            return rooms.includes(roomID)
        }
        const room = await this.roomShared(email, reservation.id)
        return room === roomID
    }
}