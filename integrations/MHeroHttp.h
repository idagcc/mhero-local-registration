#pragma once
// Unreal transport helper. Add "HTTP", "Json", "JsonUtilities" to Build.cs.
// Keep a connector instance in a GameInstance subsystem and implement the state
// machine in docs/GAME-INTEGRATION.md. This helper does not start gameplay itself.
#include "CoreMinimal.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace MHeroHttp
{
    using FReply = TFunction<void(int32, const TSharedPtr<FJsonObject>&)>;
    inline void Post(const FString& ServerUrl, const FString& GameKey,
                     const FString& Path, const TSharedPtr<FJsonObject>& Body, FReply Callback)
    {
        FString Json;
        auto Writer = TJsonWriterFactory<>::Create(&Json);
        FJsonSerializer::Serialize(Body.ToSharedRef(), Writer);
        auto Request = FHttpModule::Get().CreateRequest();
        Request->SetURL(ServerUrl + TEXT("/api/game") + Path);
        Request->SetVerb(TEXT("POST"));
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
        Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + GameKey);
        Request->SetContentAsString(Json);
        Request->SetTimeout(5.0f);
        Request->OnProcessRequestComplete().BindLambda(
            [Callback](FHttpRequestPtr Req, FHttpResponsePtr Response, bool bSucceeded)
            {
                TSharedPtr<FJsonObject> Parsed;
                const int32 Status = Response.IsValid() ? Response->GetResponseCode() : 0;
                if (bSucceeded && Response.IsValid())
                {
                    auto Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
                    FJsonSerializer::Deserialize(Reader, Parsed);
                }
                Callback(Status, Parsed);
            });
        if (!Request->ProcessRequest()) Callback(0, nullptr);
    }
}
