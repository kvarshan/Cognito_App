package com.example.cognito.util

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.android.gms.tasks.Tasks
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.zip.ZipFile

object TextExtractors {
    
    // Initialize PDFBox (required by pdfbox-android library)
    fun init(context: Context) {
        try {
            PDFBoxResourceLoader.init(context)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun extractText(context: Context, file: File): String {
        val ext = file.extension.lowercase()
        return try {
            when (ext) {
                "pdf" -> extractPdfText(file)
                "docx" -> extractDocxText(file)
                "pptx" -> extractPptxText(file)
                "txt", "md" -> extractPlainText(file)
                "jpg", "jpeg", "png", "bmp" -> extractTextFromImage(context, file)
                else -> ""
            }
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    private fun extractTextFromImage(context: Context, file: File): String {
        return try {
            val uri = android.net.Uri.fromFile(file)
            val inputImage = InputImage.fromFilePath(context, uri)
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            val visionText = Tasks.await(recognizer.process(inputImage))
            visionText.text
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    private fun extractPdfText(file: File): String {
        var document: PDDocument? = null
        return try {
            document = PDDocument.load(file)
            val stripper = PDFTextStripper()
            stripper.getText(document) ?: ""
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        } finally {
            try {
                document?.close()
            } catch (ex: Exception) {
                ex.printStackTrace()
            }
        }
    }

    // DOCX parser (parsing word/document.xml in zip)
    private fun extractDocxText(file: File): String {
        return try {
            val zipFile = ZipFile(file)
            val entry = zipFile.getEntry("word/document.xml")
            if (entry != null) {
                val inputStream = zipFile.getInputStream(entry)
                val xmlContent = inputStream.bufferedReader().use { it.readText() }
                zipFile.close()
                cleanXmlTags(xmlContent)
            } else {
                zipFile.close()
                ""
            }
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    // PPTX parser (parsing ppt/slides/slide*.xml in zip)
    private fun extractPptxText(file: File): String {
        val slideTexts = mutableListOf<String>()
        return try {
            val zipFile = ZipFile(file)
            val entries = zipFile.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement()
                if (entry.name.startsWith("ppt/slides/slide") && entry.name.endsWith(".xml")) {
                    val inputStream = zipFile.getInputStream(entry)
                    val xmlContent = inputStream.bufferedReader().use { it.readText() }
                    val cleanText = cleanXmlTags(xmlContent)
                    if (cleanText.isNotBlank()) {
                        slideTexts.add(cleanText)
                    }
                }
            }
            zipFile.close()
            slideTexts.joinToString("\n")
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    private fun extractPlainText(file: File): String {
        return try {
            file.readText(Charsets.UTF_8)
        } catch (e: Exception) {
            // Fallback encoding
            try {
                file.readText(Charsets.ISO_8859_1)
            } catch (ex: Exception) {
                ""
            }
        }
    }

    // Strips XML tags and normalizes whitespace
    private fun cleanXmlTags(xml: String): String {
        val output = StringBuilder()
        var inTag = false
        var i = 0
        val len = xml.length
        while (i < len) {
            val c = xml[i]
            if (c == '<') {
                inTag = true
                // Special handling: insert space on paragraph endings
                if (i + 2 < len && xml[i + 1] == '/' && (xml[i + 2] == 'p' || xml[i + 2] == 'r')) {
                    output.append(" ")
                }
            } else if (c == '>') {
                inTag = false
            } else if (!inTag) {
                output.append(c)
            }
            i++
        }
        
        // Decode common XML entities
        var text = output.toString()
        text = text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&nbsp;", " ")
        
        // Normalize whitespace
        return text.replace(Regex("\\s+"), " ").trim()
    }
}
