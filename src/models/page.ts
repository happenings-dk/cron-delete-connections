import mongoose, { Schema, Document } from 'mongoose';

export interface IPage extends Document {
    id: string;
    name: string;
    createdat: {
        seconds: number;
        nanos: number;
    };
    image: {
        original: string;
        large: string;
        medium: string;
        small: string;
        tiny: string;
    };
    coverimage: {
        original: string;
        large: string;
        medium: string;
        small: string;
        tiny: string;
    };
    description: string;
    ispublic: boolean;
    username: string;
    verified: boolean;
    type: number;
    tabs: number[];
    ispostadminonly: boolean;
}

const PageSchema = new Schema({
    id: String,
    name: String,
    createdat: {
        seconds: Number,
        nanos: Number
    },
    image: {
        original: String,
        large: String,
        medium: String,
        small: String,
        tiny: String
    },
    coverimage: {
        original: String,
        large: String,
        medium: String,
        small: String,
        tiny: String
    },
    description: String,
    ispublic: Boolean,
    username: String,
    verified: Boolean,
    type: Number,
    tabs: [Number],
    ispostadminonly: Boolean
}, { collection: 'Page.Pages' });

export const Page = mongoose.model<IPage>('Page', PageSchema);