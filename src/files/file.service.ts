import { Config } from '../config'
import { Dependencies } from '../container'
import { reject } from 'ramda'
import * as AWS from 'aws-sdk'

export interface IFileService {
    uploadFile(file: any, name: string): Promise<string>
    getFile(name: string): string
}

// TODO implement real file service with S3
export class FileService implements IFileService {
    private BUCKET_ID: string
    private BUCKET_SECRET: string
    private BUCKET_NAME: string

    constructor({ config }: Dependencies<Config>) {
        this.BUCKET_ID = config.BUCKET_ID
        this.BUCKET_SECRET = config.BUCKET_SECRET
        this.BUCKET_NAME = config.BUCKET_NAME
    }

    s3 = new AWS.S3({
        accessKeyId: this.BUCKET_ID,
        secretAccessKey: this.BUCKET_SECRET,
    })

    uploadFile(file: any, name: string): Promise<any> {
        const params = {
            Bucket: this.BUCKET_NAME,
            Key: name,
            Body: file,
        }
        return new Promise((resolve, reject) => {
            this.s3.upload(params, function (err: any, data: any) {
                if (err) {
                    return reject(err)
                }
                return resolve(data.key)
            })
        })
    }

    getFile(name: string) {
        return 'https://' + this.BUCKET_NAME + '.s3.amazonaws.com/' + name
    }
}
